import type { NewsletterBuilderOutput } from "../newsletter/types"
import { getExamples, getStyleGuide } from "./cache"
import { buildWriterPrompt } from "./promptBuilder"
import type { WriterEngineOutput } from "./types"

/**
 * Coordinates the Writer Engine: loads the cached style guide and the
 * example newsletters relevant to this newsletter's type, assembles the
 * final Writer prompt, and returns it alongside traceability metadata.
 *
 * This function makes no AI calls and writes no newsletter prose — it
 * only prepares context for a future Writer AI call.
 */
export function prepareWriterPrompt(builderOutput: NewsletterBuilderOutput): WriterEngineOutput {
  const styleGuide = getStyleGuide()
  const examples = getExamples(builderOutput.newsletterType)

  const { prompt, selectedExamples } = buildWriterPrompt({
    builderOutput,
    styleGuide,
    examples,
  })

  return {
    prompt,
    newsletterType: builderOutput.newsletterType,
    metadata: {
      builderVersion: builderOutput.metadata.builderVersion,
      styleGuideVersion: styleGuide.version,
      exampleVersions: selectedExamples.map((example) => `${example.filename}@${example.version}`),
      newsletterType: builderOutput.newsletterType,
    },
  }
}
