import fs from "node:fs"
import path from "node:path"
import Groq from "groq-sdk"
import { getActiveLlmConfig } from "../../config/llmProvider"
import { OllamaChatClient, type ChatCompletionLike } from "../../config/ollamaClient"
import { GroqProviderError, ExtractionValidationError } from "../errors"
import { FeatureExtractionSchema, type FeatureExtraction } from "../schemas/featureExtraction.schema"
import { extractJsonObjectText } from "../jsonExtract"
import { normalizeFeatureStatuses } from "../statusNormalizer"
import { fillMissingExtractionDefaults } from "../extractionDefaults"
import { FEATURE_EXTRACTION_JSON_SCHEMA } from "../jsonSchemas"
import { pipelineDebugger, extractFeaturesArray } from "../../debug/pipelineDebugger"
import type { DocumentChunk } from "./types"

// Mirrors groqProvider.ts's own path computation (backend/src/ai/providers/
// -> backend/src/ai/prompts/extractor.md). Not imported from groqProvider.ts
// — that module's loadExtractorPrompt() is private, and the single-pass
// path is explicitly off-limits to modify. Reading the same file from a
// sibling module is not a modification of it.
const EXTRACTOR_PROMPT_PATH = path.join(__dirname, "..", "prompts", "extractor.md")

function loadExtractorPrompt(): string {
  return fs.readFileSync(EXTRACTOR_PROMPT_PATH, "utf-8")
}

/** Thrown when a chunk call's finish_reason is "length" — never merge a truncated extraction. */
export class ChunkTruncatedError extends Error {
  readonly chunkIndex: number
  readonly finishReason: string

  constructor(chunkIndex: number, finishReason: string) {
    super(`Chunk ${chunkIndex} extraction was truncated (finish_reason: "${finishReason}"). Refusing to merge a truncated extraction.`)
    this.name = "ChunkTruncatedError"
    this.chunkIndex = chunkIndex
    this.finishReason = finishReason
  }
}

export interface ChunkCallResult {
  chunkIndex: number
  rawContent: string
  parsed: FeatureExtraction
  finishReason: string
  usage: { promptTokens?: number; completionTokens?: number; totalTokens?: number }
  rateLimitHeaders: Record<string, string>
}

/**
 * Executes ONE live Groq call for a single chunk. Same extractor.md
 * system prompt and Zod schema as the single-pass path (both untouched,
 * both explicitly off-limits) — the only difference is `max_tokens`,
 * which uses the chunked-path output reserve, not the global
 * GROQ_MAX_OUTPUT_TOKENS. Checks finish_reason explicitly: throws
 * ChunkTruncatedError on "length" rather than silently accepting a
 * truncated extraction, exactly as required.
 */
export async function extractChunkLive(chunk: DocumentChunk, outputReserveTokens: number): Promise<ChunkCallResult> {
  const config = getActiveLlmConfig()
  if (!config.apiKey) {
    throw new GroqProviderError("GROQ_API_KEY is not configured")
  }

  const systemPrompt = loadExtractorPrompt()
  const requestParams = {
    model: config.model,
    temperature: 0.2,
    max_tokens: outputReserveTokens,
    response_format: { type: "json_object" as const },
    messages: [
      { role: "system" as const, content: systemPrompt },
      { role: "user" as const, content: chunk.text },
    ],
  }

  let completion: ChatCompletionLike
  // Rate-limit headers only exist on Groq's hosted API — there's nothing to
  // read for a local Ollama call (no TPM/TPD), and OllamaChatClient doesn't
  // implement .withResponse(), so that path is skipped entirely rather than
  // faked.
  let responseHeaders: Headers | null = null

  const llmRequestStartedAt = Date.now()
  try {
    if (config.isOllama) {
      const client = new OllamaChatClient(config.baseURL!, config.timeout!)
      // format is Ollama-only (native /api/chat structured-output
      // constraint, see jsonSchemas.ts) — added here, not in the shared
      // requestParams above, so the Groq branch below never sees it.
      completion = await client.chat.completions.create({ ...requestParams, format: FEATURE_EXTRACTION_JSON_SCHEMA })
    } else {
      const client = new Groq({ apiKey: config.apiKey, baseURL: config.baseURL, timeout: config.timeout })
      const result = await client.chat.completions.create(requestParams).withResponse()
      completion = result.data
      responseHeaders = result.response.headers
    }
    pipelineDebugger.record({
      stage: "LLM Request",
      startedAt: llmRequestStartedAt,
      endedAt: Date.now(),
      inputCount: 1,
      outputCount: 1,
      firstSample: `chunk ${chunk.index}, model=${config.model}`,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error calling the Groq API"
    pipelineDebugger.record({
      stage: "LLM Request",
      startedAt: llmRequestStartedAt,
      endedAt: Date.now(),
      inputCount: 1,
      outputCount: 0,
      firstSample: `chunk ${chunk.index}, model=${config.model}`,
      errors: [message],
    })
    throw new GroqProviderError(`Chunk ${chunk.index}: ` + message, error)
  }

  // Logged unconditionally, immediately after a successful API response —
  // BEFORE finish_reason/JSON-parse/Zod validation, any of which can throw
  // below. A validation failure used to mean this call's real token cost
  // was never recorded anywhere: the completion happened and consumed
  // tokens regardless of whether the response passed validation, but the
  // caller's own usage logging only runs on the success path (after this
  // function returns), which a thrown error never reaches.
  console.log(
    `[chunkedExtraction] chunk ${chunk.index} usage (recorded before validation): ` +
      `prompt=${completion.usage?.prompt_tokens}, completion=${completion.usage?.completion_tokens}, total=${completion.usage?.total_tokens}`,
  )

  const choice = completion.choices[0]
  const finishReason = choice?.finish_reason ?? "unknown"
  const rawContent = choice?.message?.content ?? ""

  const rawResponseTimestamp = Date.now()
  if (finishReason === "length") {
    pipelineDebugger.record({
      stage: "Raw LLM Response",
      startedAt: rawResponseTimestamp,
      endedAt: rawResponseTimestamp,
      inputCount: 1,
      outputCount: 0,
      firstSample: rawContent,
      errors: [`chunk ${chunk.index}: truncated (finish_reason: "length")`],
    })
    throw new ChunkTruncatedError(chunk.index, finishReason)
  }

  if (!rawContent) {
    pipelineDebugger.record({
      stage: "Raw LLM Response",
      startedAt: rawResponseTimestamp,
      endedAt: rawResponseTimestamp,
      inputCount: 1,
      outputCount: 0,
      errors: [`chunk ${chunk.index}: response did not contain any content`],
    })
    throw new GroqProviderError(`Chunk ${chunk.index}: Groq response did not contain any content`)
  }
  pipelineDebugger.record({
    stage: "Raw LLM Response",
    startedAt: rawResponseTimestamp,
    endedAt: rawResponseTimestamp,
    inputCount: 1,
    outputCount: 1,
    firstSample: rawContent,
  })

  const jsonParsingStartedAt = Date.now()
  let parsedJson: unknown
  try {
    parsedJson = JSON.parse(extractJsonObjectText(rawContent))
  } catch (error) {
    pipelineDebugger.record({
      stage: "JSON Parsing",
      startedAt: jsonParsingStartedAt,
      endedAt: Date.now(),
      inputCount: 1,
      outputCount: 0,
      firstSample: rawContent,
      errors: [error instanceof Error ? error.message : "Groq response was not valid JSON"],
    })
    throw new GroqProviderError(`Chunk ${chunk.index}: Groq response was not valid JSON`, error)
  }

  const parsedFeatures = extractFeaturesArray(parsedJson)
  pipelineDebugger.record({
    stage: "JSON Parsing",
    startedAt: jsonParsingStartedAt,
    endedAt: Date.now(),
    inputCount: 1,
    outputCount: parsedFeatures.length,
    firstSample: parsedFeatures[0],
  })
  console.log(`[chunkedExtraction] chunk ${chunk.index}: parsed ${parsedFeatures.length} feature(s)`)

  const defaultsFillStartedAt = Date.now()
  const filled = fillMissingExtractionDefaults(parsedJson)
  const filledFeatures = extractFeaturesArray(filled)
  pipelineDebugger.record({
    stage: "Defaults Fill",
    startedAt: defaultsFillStartedAt,
    endedAt: Date.now(),
    inputCount: parsedFeatures.length,
    outputCount: filledFeatures.length,
    firstSample: filledFeatures[0],
  })

  const statusNormalizationStartedAt = Date.now()
  const normalized = normalizeFeatureStatuses(filled)
  const normalizedFeatures = extractFeaturesArray(normalized)
  pipelineDebugger.record({
    stage: "Status Normalization",
    startedAt: statusNormalizationStartedAt,
    endedAt: Date.now(),
    inputCount: filledFeatures.length,
    outputCount: normalizedFeatures.length,
    firstSample: normalizedFeatures[0],
  })

  const zodValidationStartedAt = Date.now()
  const validation = FeatureExtractionSchema.safeParse(normalized)
  if (!validation.success) {
    pipelineDebugger.record({
      stage: "Zod Validation",
      startedAt: zodValidationStartedAt,
      endedAt: Date.now(),
      inputCount: normalizedFeatures.length,
      outputCount: 0,
      firstSample: normalizedFeatures[0],
      validationFailures: [validation.error.message],
    })
    throw new ExtractionValidationError(validation.error)
  }
  pipelineDebugger.record({
    stage: "Zod Validation",
    startedAt: zodValidationStartedAt,
    endedAt: Date.now(),
    inputCount: normalizedFeatures.length,
    outputCount: validation.data.features.length,
    firstSample: validation.data.features[0],
  })

  console.log(`[chunkedExtraction] chunk ${chunk.index}: ${validation.data.features.length} feature(s) validated`)

  const rateLimitHeaders: Record<string, string> = {}
  responseHeaders?.forEach((value, key) => {
    if (key.toLowerCase().includes("ratelimit")) rateLimitHeaders[key] = value
  })

  return {
    chunkIndex: chunk.index,
    rawContent,
    parsed: validation.data,
    finishReason,
    usage: {
      promptTokens: completion.usage?.prompt_tokens,
      completionTokens: completion.usage?.completion_tokens,
      totalTokens: completion.usage?.total_tokens,
    },
    rateLimitHeaders,
  }
}
