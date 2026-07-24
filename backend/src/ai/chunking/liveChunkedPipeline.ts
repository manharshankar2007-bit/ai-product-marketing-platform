import fs from "node:fs"
import path from "node:path"
import type { GroqProvider } from "../providers/groqProvider"
import { getActiveLlmConfig } from "../../config/llmProvider"
import { ExtractionValidationError } from "../errors"
import { FeatureExtractionSchema, type ExtractedFeature, type FeatureExtraction } from "../schemas/featureExtraction.schema"
import { isolateFutureScopeSection } from "../futureScopePass"
import { planChunks, CHUNKED_PATH_MAX_OUTPUT_TOKENS } from "./chunker"
import { extractChunkLive } from "./chunkedExtraction"
import { RateLimiter } from "./rateLimiter"
import { TPM_LIMIT, SAFETY_MARGIN_TOKENS } from "./router"
import { mergeExtractedFeatures } from "./merger"
import type { TaggedFeature } from "./types"
import { pipelineDebugger } from "../../debug/pipelineDebugger"

// Mirrors groqProvider.ts's own path computation, same rationale as
// chunkedExtraction.ts — the single-pass path stays untouched.
const EXTRACTOR_PROMPT_PATH = path.join(__dirname, "..", "prompts", "extractor.md")

export function loadExtractorPromptForChunking(): string {
  return fs.readFileSync(EXTRACTOR_PROMPT_PATH, "utf-8")
}

/** Same status default as futureScopePass.ts's own (private) defaultToPlanned — reimplemented here rather than exported from that module, which stays untouched. */
function defaultToPlanned(feature: ExtractedFeature): ExtractedFeature {
  return feature.status !== null ? feature : { ...feature, status: "planned" }
}

/**
 * Live orchestration for a document too large for the single-pass path.
 * Router already decided this document needs chunking before this is
 * called. Flow: chunk -> paced live calls (finish_reason checked on every
 * one, raw JSON logged before merging) -> chunk-vs-chunk merge -> Future
 * Scope second pass (unchanged, its own call) -> final merge (RULE 1
 * lets Future Scope win any collision) -> Zod validation, identical to
 * the single-pass path's own validation, no special-casing.
 */
export async function extractFeaturesChunkedLive(
  groqProvider: GroqProvider,
  cleanText: string,
): Promise<FeatureExtraction> {
  const systemPrompt = loadExtractorPromptForChunking()
  const chunkingStartedAt = Date.now()
  const plan = planChunks(cleanText, systemPrompt, CHUNKED_PATH_MAX_OUTPUT_TOKENS)
  pipelineDebugger.record({
    stage: "Chunking",
    startedAt: chunkingStartedAt,
    endedAt: Date.now(),
    inputCount: cleanText.length,
    outputCount: plan.chunks.length,
    firstSample: plan.chunks[0]?.sections,
  })

  // Chunk PLANNING (planChunks above) is provider-agnostic and untouched —
  // same chunk count/boundaries regardless of provider. Only the pacing
  // between live calls is skipped for Ollama: there's no TPM/TPD to
  // respect against a local server, so waitForCapacity/recordUsage would
  // just be an arbitrary, pointless delay.
  const { isOllama } = getActiveLlmConfig()
  const limiter = new RateLimiter(TPM_LIMIT - SAFETY_MARGIN_TOKENS)
  const chunkTagged: TaggedFeature[] = []
  const chunkParsedResults: FeatureExtraction[] = []

  for (const chunk of plan.chunks) {
    if (!isOllama) await limiter.waitForCapacity(chunk.estimatedTotalCallTokens)

    const result = await extractChunkLive(chunk, CHUNKED_PATH_MAX_OUTPUT_TOKENS)
    if (!isOllama) limiter.recordUsage(result.usage.totalTokens ?? chunk.estimatedTotalCallTokens)

    console.log(
      `[chunkedPipeline] chunk ${chunk.index} usage: prompt=${result.usage.promptTokens}, completion=${result.usage.completionTokens}, total=${result.usage.totalTokens}, finish_reason=${result.finishReason}`,
    )

    chunkParsedResults.push(result.parsed)
    for (const feature of result.parsed.features) {
      chunkTagged.push({ source: { kind: "chunk", chunkIndex: chunk.index }, feature })
    }
  }

  const chunkMergeStartedAt = Date.now()
  const chunkMerge = mergeExtractedFeatures(chunkTagged, plan.chunks.length)
  pipelineDebugger.record({
    stage: "Merge",
    startedAt: chunkMergeStartedAt,
    endedAt: Date.now(),
    inputCount: chunkTagged.length,
    outputCount: chunkMerge.features.length,
    firstSample: chunkMerge.features[0],
  })

  // Future Scope second pass — unchanged mechanism (isolateFutureScopeSection
  // + a single extractFeatures call), just called directly here instead of
  // via extractFeaturesWithFutureScopePass, since that function's own main
  // pass is the single-pass call this document can't use.
  let futureScopeFeatures: ExtractedFeature[] = []
  const futureScopeText = isolateFutureScopeSection(cleanText)
  if (futureScopeText) {
    try {
      const futureScopeResult = await groqProvider.extractFeatures(futureScopeText)
      futureScopeFeatures = futureScopeResult.features.map(defaultToPlanned)
    } catch (error) {
      console.error(
        "[chunkedPipeline] Future Scope second pass failed, proceeding without it:",
        error instanceof Error ? error.message : error,
      )
    }
  }

  const finalTagged: TaggedFeature[] = [
    ...chunkMerge.features.map((feature): TaggedFeature => ({ source: { kind: "chunk", chunkIndex: 0 }, feature })),
    ...futureScopeFeatures.map((feature): TaggedFeature => ({ source: { kind: "future_scope" }, feature })),
  ]
  const finalMergeStartedAt = Date.now()
  const finalMerge = mergeExtractedFeatures(finalTagged, 1)
  pipelineDebugger.record({
    stage: "Merge",
    startedAt: finalMergeStartedAt,
    endedAt: Date.now(),
    inputCount: finalTagged.length,
    outputCount: finalMerge.features.length,
    firstSample: finalMerge.features[0],
  })

  if (chunkMerge.collisionLog.length > 0 || finalMerge.collisionLog.length > 0) {
    console.log("[chunkedPipeline] merge collisions:", JSON.stringify([...chunkMerge.collisionLog, ...finalMerge.collisionLog]))
  }
  if (chunkMerge.distinctFeatureSuspicions.length > 0) {
    console.log("[chunkedPipeline] distinct-feature suspicions:", JSON.stringify(chunkMerge.distinctFeatureSuspicions))
  }

  const wrapped = {
    documentTitle: plan.documentTitle,
    releaseName: chunkParsedResults.find((r) => r.releaseName)?.releaseName ?? null,
    // Same "first chunk with a non-empty value wins" pattern as releaseName
    // above — these are document-level fields that only ever appear once
    // in the source, so at most one chunk will parse them as non-null/non-empty.
    problemStatement: chunkParsedResults.find((r) => r.problemStatement)?.problemStatement ?? null,
    whyBuilt: chunkParsedResults.find((r) => r.whyBuilt)?.whyBuilt ?? null,
    releasePlan: chunkParsedResults.flatMap((r) => r.releasePlan),
    features: finalMerge.features,
    uiChanges: chunkParsedResults.flatMap((r) => r.uiChanges),
    enhancements: chunkParsedResults.flatMap((r) => r.enhancements),
    bugFixes: chunkParsedResults.flatMap((r) => r.bugFixes),
    knownLimitations: chunkParsedResults.flatMap((r) => r.knownLimitations),
  }

  // Same schema, same failure handling as the single-pass path — no
  // special-casing for merged output.
  const finalValidationStartedAt = Date.now()
  const validation = FeatureExtractionSchema.safeParse(wrapped)
  if (!validation.success) {
    pipelineDebugger.record({
      stage: "Merge",
      startedAt: finalValidationStartedAt,
      endedAt: Date.now(),
      inputCount: finalMerge.features.length,
      outputCount: 0,
      firstSample: finalMerge.features[0],
      validationFailures: [validation.error.message],
    })
    throw new ExtractionValidationError(validation.error)
  }
  pipelineDebugger.record({
    stage: "Merge",
    startedAt: finalValidationStartedAt,
    endedAt: Date.now(),
    inputCount: finalMerge.features.length,
    outputCount: validation.data.features.length,
    firstSample: validation.data.features[0],
  })

  return validation.data
}
