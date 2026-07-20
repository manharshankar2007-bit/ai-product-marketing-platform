import type { NewsletterBuilderOutput, NewsletterFeatureItem, NewsletterType } from "../newsletter/types"

export interface WriterPromptMetadata {
  builderVersion: string
  /** Version tag for the slot-filling prompt template itself — replaces the old styleGuideVersion/exampleVersions now that neither exists. */
  promptVersion: string
  newsletterType: NewsletterType
}

export interface WriterEngineOutput {
  prompt: string
  newsletterType: NewsletterType
  metadata: WriterPromptMetadata
  /** Exactly the items embedded in `prompt` (post-dedupe/normalization/filter) — the Verifier's ground truth. See newsletterVerifier.ts. */
  sourceItems: NewsletterFeatureItem[]
}

export interface BuildPromptParams {
  builderOutput: NewsletterBuilderOutput
}

export interface BuildPromptResult {
  prompt: string
}

/**
 * Thrown only for genuinely unrecoverable failures — kept for errorHandler.ts's
 * existing mapping, though the slot-filling prompt has no file dependency of
 * its own anymore (no style guide, no example files).
 */
export class WriterEngineFileNotFoundError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "WriterEngineFileNotFoundError"
  }
}
