import fs from "node:fs"
import path from "node:path"
import type { GroqProvider } from "../providers/groqProvider"
import { ExtractionValidationError } from "../errors"
import { FeatureExtractionSchema, type ExtractedFeature, type FeatureExtraction } from "../schemas/featureExtraction.schema"
import { isolateFutureScopeSection } from "../futureScopePass"
import { planChunks, CHUNKED_PATH_MAX_OUTPUT_TOKENS } from "./chunker"
import { extractChunkLive } from "./chunkedExtraction"
import { RateLimiter } from "./rateLimiter"
import { TPM_LIMIT, SAFETY_MARGIN_TOKENS } from "./router"
import { mergeExtractedFeatures } from "./merger"
import type { TaggedFeature } from "./types"

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
  const plan = planChunks(cleanText, systemPrompt, CHUNKED_PATH_MAX_OUTPUT_TOKENS)

  const limiter = new RateLimiter(TPM_LIMIT - SAFETY_MARGIN_TOKENS)
  const chunkTagged: TaggedFeature[] = []
  const chunkParsedResults: FeatureExtraction[] = []

  for (const chunk of plan.chunks) {
    await limiter.waitForCapacity(chunk.estimatedTotalCallTokens)

    const result = await extractChunkLive(chunk, CHUNKED_PATH_MAX_OUTPUT_TOKENS)
    limiter.recordUsage(result.usage.totalTokens ?? chunk.estimatedTotalCallTokens)

    // Evidence before merging, per the design requirement — if anything
    // is wrong downstream, per-chunk raw output is visible without
    // buying another live run.
    console.log(`[chunkedPipeline] chunk ${chunk.index} raw extraction:`, result.rawContent)
    console.log(
      `[chunkedPipeline] chunk ${chunk.index} usage: prompt=${result.usage.promptTokens}, completion=${result.usage.completionTokens}, total=${result.usage.totalTokens}, finish_reason=${result.finishReason}`,
    )

    chunkParsedResults.push(result.parsed)
    for (const feature of result.parsed.features) {
      chunkTagged.push({ source: { kind: "chunk", chunkIndex: chunk.index }, feature })
    }
  }

  const chunkMerge = mergeExtractedFeatures(chunkTagged, plan.chunks.length)

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
  const finalMerge = mergeExtractedFeatures(finalTagged, 1)

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
  const validation = FeatureExtractionSchema.safeParse(wrapped)
  if (!validation.success) {
    throw new ExtractionValidationError(validation.error)
  }

  return validation.data
}
