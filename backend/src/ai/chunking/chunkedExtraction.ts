import fs from "node:fs"
import path from "node:path"
import Groq from "groq-sdk"
import { env } from "../../config/env"
import { GroqProviderError, ExtractionValidationError } from "../errors"
import { FeatureExtractionSchema, type FeatureExtraction } from "../schemas/featureExtraction.schema"
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
  if (!env.groqApiKey) {
    throw new GroqProviderError("GROQ_API_KEY is not configured")
  }

  const client = new Groq({ apiKey: env.groqApiKey })
  const systemPrompt = loadExtractorPrompt()

  let completion: Groq.Chat.Completions.ChatCompletion
  let responseHeaders: Headers

  try {
    const result = await client.chat.completions
      .create({
        model: env.groqModel,
        temperature: 0.2,
        max_tokens: outputReserveTokens,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: chunk.text },
        ],
      })
      .withResponse()
    completion = result.data
    responseHeaders = result.response.headers
  } catch (error) {
    throw new GroqProviderError(
      `Chunk ${chunk.index}: ` + (error instanceof Error ? error.message : "Unknown error calling the Groq API"),
      error,
    )
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

  if (finishReason === "length") {
    throw new ChunkTruncatedError(chunk.index, finishReason)
  }

  if (!rawContent) {
    throw new GroqProviderError(`Chunk ${chunk.index}: Groq response did not contain any content`)
  }

  let parsedJson: unknown
  try {
    parsedJson = JSON.parse(rawContent)
  } catch (error) {
    throw new GroqProviderError(`Chunk ${chunk.index}: Groq response was not valid JSON`, error)
  }

  const validation = FeatureExtractionSchema.safeParse(parsedJson)
  if (!validation.success) {
    throw new ExtractionValidationError(validation.error)
  }

  const rateLimitHeaders: Record<string, string> = {}
  responseHeaders.forEach((value, key) => {
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
