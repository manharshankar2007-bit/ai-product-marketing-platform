import type { NewsletterBuilderOutput, NewsletterType } from "../newsletter/types"

export interface LoadedStyleGuide {
  content: string
  /** Short content hash — changes automatically whenever the guide is revised. */
  version: string
}

export interface LoadedExample {
  filename: string
  content: string
  /** Short content hash — changes automatically whenever the example file is revised. */
  version: string
}

export interface WriterPromptMetadata {
  builderVersion: string
  styleGuideVersion: string
  /** `"<filename>@<version>"` for each example actually included in the prompt (post-trimming). */
  exampleVersions: string[]
  newsletterType: NewsletterType
}

export interface WriterEngineOutput {
  prompt: string
  newsletterType: NewsletterType
  metadata: WriterPromptMetadata
}

export interface BuildPromptParams {
  builderOutput: NewsletterBuilderOutput
  styleGuide: LoadedStyleGuide
  examples: LoadedExample[]
  /** Override for testing the token-budget trimming path. */
  maxExampleTokens?: number
}

export interface BuildPromptResult {
  prompt: string
  selectedExamples: LoadedExample[]
}

/**
 * Thrown only for genuinely unrecoverable failures — a required style
 * guide or example file is missing from disk. Never thrown for anything
 * recoverable; this module has no "warnings" concept of its own since it
 * does no classification or validation, only file loading and assembly.
 */
export class WriterEngineFileNotFoundError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "WriterEngineFileNotFoundError"
  }
}
