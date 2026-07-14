import fs from "node:fs"
import path from "node:path"
import Groq from "groq-sdk"
import { env } from "../../config/env"
import { FeatureExtractionSchema, type FeatureExtraction } from "../schemas/featureExtraction.schema"
import { DocumentTooLargeError, ExtractionValidationError, GroqProviderError } from "../errors"

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
  private readonly client: Groq
  private readonly model: string
  private readonly systemPrompt: string

  constructor() {
    if (!env.groqApiKey) {
      throw new GroqProviderError("GROQ_API_KEY is not configured")
    }

    this.client = new Groq({ apiKey: env.groqApiKey })
    this.model = env.groqModel
    this.systemPrompt = loadExtractorPrompt()
  }

  async extractFeatures(cleanText: string): Promise<FeatureExtraction> {
    this.assertWithinContextWindow(cleanText)

    const rawContent = await this.requestCompletion(cleanText)
    const parsed = this.parseJson(rawContent)

    return this.validate(parsed)
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
    let completion: Groq.Chat.Completions.ChatCompletion

    try {
      completion = await this.client.chat.completions.create({
        model: this.model,
        temperature: 0.2,
        max_tokens: env.groqMaxOutputTokens,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: this.systemPrompt },
          { role: "user", content: cleanText },
        ],
      })
    } catch (error) {
      throw new GroqProviderError(
        error instanceof Error ? error.message : "Unknown error calling the Groq API",
        error,
      )
    }

    const content = completion.choices[0]?.message?.content

    if (!content) {
      throw new GroqProviderError("Groq response did not contain any content")
    }

    return content
  }

  private parseJson(rawContent: string): unknown {
    try {
      return JSON.parse(rawContent)
    } catch (error) {
      throw new GroqProviderError("Groq response was not valid JSON", error)
    }
  }

  private validate(parsedJson: unknown): FeatureExtraction {
    const result = FeatureExtractionSchema.safeParse(parsedJson)

    if (!result.success) {
      throw new ExtractionValidationError(result.error)
    }

    return result.data
  }
}
