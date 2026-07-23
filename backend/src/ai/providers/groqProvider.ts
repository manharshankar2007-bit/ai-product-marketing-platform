import fs from "node:fs"
import path from "node:path"
import Groq from "groq-sdk"
import { env } from "../../config/env"
import { getActiveLlmConfig } from "../../config/llmProvider"
import { OllamaChatClient, type ChatCompletionLike } from "../../config/ollamaClient"
import { FeatureExtractionSchema, type FeatureExtraction } from "../schemas/featureExtraction.schema"
import { DocumentTooLargeError, ExtractionValidationError, GroqProviderError } from "../errors"
import { extractJsonObjectText } from "../jsonExtract"
import { normalizeFeatureStatuses } from "../statusNormalizer"
import { fillMissingExtractionDefaults } from "../extractionDefaults"
import { FEATURE_EXTRACTION_JSON_SCHEMA } from "../jsonSchemas"
import { pipelineDebugger, extractFeaturesArray } from "../../debug/pipelineDebugger"

const EXTRACTOR_PROMPT_PATH = path.join(__dirname, "..", "prompts", "extractor.md")

// Rough, model-agnostic heuristic (~4 characters per token for English
// text). This module does not depend on a model-specific tokenizer; the
// estimate is intentionally conservative and only used to decide whether a
// document must be rejected as too large — never to truncate it.
const CHARS_PER_TOKEN_ESTIMATE = 4

function estimateTokenCount(text: string): number {
  return Math.ceil(text.length / CHARS_PER_TOKEN_ESTIMATE)
}

function loadExtractorPrompt(): string {
  return fs.readFileSync(EXTRACTOR_PROMPT_PATH, "utf-8")
}

/**
 * Reusable Groq provider for the feature extraction module.
 *
 * Exposes exactly one public method, `extractFeatures`. Everything else
 * (context-window checks, the request itself, JSON parsing, schema
 * validation) is private implementation detail.
 */
export class GroqProvider {
  private readonly client: Groq | OllamaChatClient
  private readonly isOllama: boolean
  private readonly model: string
  private readonly systemPrompt: string

  constructor() {
    const config = getActiveLlmConfig()
    if (!config.apiKey) {
      throw new GroqProviderError("GROQ_API_KEY is not configured")
    }

    // Groq branch stays exactly `new Groq({ apiKey })` in effect — baseURL
    // and timeout are undefined for provider "groq", which is groq-sdk's
    // own default, so this is byte-identical to before this file's provider
    // swap existed.
    this.isOllama = config.isOllama
    this.client = config.isOllama
      ? new OllamaChatClient(config.baseURL!, config.timeout!)
      : new Groq({ apiKey: config.apiKey, baseURL: config.baseURL, timeout: config.timeout })
    this.model = config.model
    this.systemPrompt = loadExtractorPrompt()
  }

  async extractFeatures(cleanText: string): Promise<FeatureExtraction> {
    this.assertWithinContextWindow(cleanText)

    const rawContent = await this.requestCompletion(cleanText)
    const parsed = this.parseJson(rawContent)
    const parsedFeatures =
      typeof parsed === "object" && parsed !== null && Array.isArray((parsed as Record<string, unknown>).features)
        ? ((parsed as Record<string, unknown>).features as unknown[])
        : []
    console.log("==========================")
    console.log("PARSED JSON")
    console.log("==========================")
    console.log(`Number of features: ${parsedFeatures.length}`)
    for (const feature of parsedFeatures) {
      const record = feature as Record<string, unknown>
      console.log(`Title: ${String(record.title ?? "(missing)")}`)
      console.log(`Raw status: ${"status" in record ? JSON.stringify(record.status) : "(missing)"}`)
    }

    const normalized = normalizeFeatureStatuses(parsed)
    const normalizedFeatures =
      typeof normalized === "object" && normalized !== null && Array.isArray((normalized as Record<string, unknown>).features)
        ? ((normalized as Record<string, unknown>).features as unknown[])
        : []
    console.log("==========================")
    console.log("AFTER NORMALIZATION")
    console.log("==========================")
    for (const feature of normalizedFeatures) {
      const record = feature as Record<string, unknown>
      console.log(`Title: ${String(record.title ?? "(missing)")}`)
      console.log(`Normalized status: ${"status" in record ? JSON.stringify(record.status) : "(missing)"}`)
    }

    const validated = this.validate(parsed)
    console.log("==========================")
    console.log("AFTER VALIDATION")
    console.log("==========================")
    console.log(`Number of validated features: ${validated.features.length}`)
    return validated
  }

  private assertWithinContextWindow(cleanText: string): void {
    const estimatedInputTokens =
      estimateTokenCount(cleanText) + estimateTokenCount(this.systemPrompt)
    const budget = env.groqContextWindowTokens - env.groqMaxOutputTokens

    if (estimatedInputTokens > budget) {
      throw new DocumentTooLargeError(estimatedInputTokens, budget)
    }
  }

  private async requestCompletion(cleanText: string): Promise<string> {
    let completion: ChatCompletionLike

    const llmRequestStartedAt = Date.now()
    try {
      completion = await this.client.chat.completions.create({
        model: this.model,
        temperature: 0.2,
        max_tokens: env.groqMaxOutputTokens,
        response_format: { type: "json_object" },
        ...(this.isOllama ? { format: FEATURE_EXTRACTION_JSON_SCHEMA } : {}),
        messages: [
          { role: "system", content: this.systemPrompt },
          { role: "user", content: cleanText },
        ],
      })
      pipelineDebugger.record({
        stage: "LLM Request",
        startedAt: llmRequestStartedAt,
        endedAt: Date.now(),
        inputCount: 1,
        outputCount: 1,
        firstSample: `single-pass, model=${this.model}`,
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error calling the Groq API"
      pipelineDebugger.record({
        stage: "LLM Request",
        startedAt: llmRequestStartedAt,
        endedAt: Date.now(),
        inputCount: 1,
        outputCount: 0,
        firstSample: `single-pass, model=${this.model}`,
        errors: [message],
      })
      throw new GroqProviderError(message, error)
    }

    const content = completion.choices[0]?.message?.content
    const rawResponseTimestamp = Date.now()

    if (!content) {
      pipelineDebugger.record({
        stage: "Raw LLM Response",
        startedAt: rawResponseTimestamp,
        endedAt: rawResponseTimestamp,
        inputCount: 1,
        outputCount: 0,
        errors: ["Groq response did not contain any content"],
      })
      throw new GroqProviderError("Groq response did not contain any content")
    }
    pipelineDebugger.record({
      stage: "Raw LLM Response",
      startedAt: rawResponseTimestamp,
      endedAt: rawResponseTimestamp,
      inputCount: 1,
      outputCount: 1,
      firstSample: content,
    })

    console.log("==========================")
    console.log("RAW MODEL RESPONSE")
    console.log("==========================")
    console.log(content)

    if (completion.usage) {
      console.log(
        `[GroqProvider] usage - prompt: ${completion.usage.prompt_tokens}, ` +
          `completion: ${completion.usage.completion_tokens}, ` +
          `total: ${completion.usage.total_tokens}`,
      )
    }

    return content
  }

  private parseJson(rawContent: string): unknown {
    const jsonParsingStartedAt = Date.now()
    let parsed: unknown
    try {
      parsed = JSON.parse(extractJsonObjectText(rawContent))
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
      throw new GroqProviderError("Groq response was not valid JSON", error)
    }
    const features = extractFeaturesArray(parsed)
    pipelineDebugger.record({
      stage: "JSON Parsing",
      startedAt: jsonParsingStartedAt,
      endedAt: Date.now(),
      inputCount: 1,
      outputCount: features.length,
      firstSample: features[0],
    })
    return parsed
  }

  private validate(parsedJson: unknown): FeatureExtraction {
    const parsedFeatures = extractFeaturesArray(parsedJson)

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
    const result = FeatureExtractionSchema.safeParse(normalized)

    if (!result.success) {
      pipelineDebugger.record({
        stage: "Zod Validation",
        startedAt: zodValidationStartedAt,
        endedAt: Date.now(),
        inputCount: normalizedFeatures.length,
        outputCount: 0,
        firstSample: normalizedFeatures[0],
        validationFailures: [result.error.message],
      })
      throw new ExtractionValidationError(result.error)
    }
    pipelineDebugger.record({
      stage: "Zod Validation",
      startedAt: zodValidationStartedAt,
      endedAt: Date.now(),
      inputCount: normalizedFeatures.length,
      outputCount: result.data.features.length,
      firstSample: result.data.features[0],
    })

    return result.data
  }
}
