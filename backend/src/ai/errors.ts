import type { z } from "zod"

/**
 * Thrown when the cleaned document text (plus prompt overhead) is estimated
 * to exceed the configured Groq model's usable context window. The caller
 * must not truncate or chunk the document — this module has one job, which
 * is converting a full document into structured JSON.
 */
export class DocumentTooLargeError extends Error {
  readonly estimatedTokens: number
  readonly maxAllowedTokens: number

  constructor(estimatedTokens: number, maxAllowedTokens: number) {
    super(
      `Document is too large for the configured Groq model's context window ` +
        `(estimated ~${estimatedTokens} tokens, limit ~${maxAllowedTokens} tokens after ` +
        `reserving space for the model's output).`,
    )
    this.name = "DocumentTooLargeError"
    this.estimatedTokens = estimatedTokens
    this.maxAllowedTokens = maxAllowedTokens
  }
}

/**
 * Thrown for any failure talking to the Groq API itself: network failure,
 * missing configuration, non-2xx response, or a response with no content.
 */
export class GroqProviderError extends Error {
  constructor(message: string, cause?: unknown) {
    super(message, cause !== undefined ? { cause } : undefined)
    this.name = "GroqProviderError"
  }
}

export interface ExtractionValidationIssue {
  path: string
  message: string
}

/**
 * Thrown when the model's JSON response does not conform to
 * FeatureExtractionSchema — invalid JSON, missing required keys, malformed
 * arrays, unexpected fields, or an invalid `status` enum value. Carries the
 * specific field paths that failed so callers can log/debug the mismatch.
 */
export class ExtractionValidationError extends Error {
  readonly issues: ExtractionValidationIssue[]

  constructor(zodError: z.ZodError) {
    const issues: ExtractionValidationIssue[] = zodError.issues.map((issue) => ({
      path: issue.path.join("."),
      message: issue.message,
    }))

    const detail = issues
      .map((issue) => `${issue.path || "(root)"}: ${issue.message}`)
      .join("; ")

    super(`Extraction result failed schema validation - ${detail}`)
    this.name = "ExtractionValidationError"
    this.issues = issues
  }
}
