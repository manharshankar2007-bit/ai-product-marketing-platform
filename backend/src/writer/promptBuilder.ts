import type { NewsletterType } from "../newsletter/types"
import type { BuildPromptParams, BuildPromptResult, LoadedExample } from "./types"

// Rough, model-agnostic heuristic (~4 characters per token), matching the
// same estimate used in src/ai/providers/groqProvider.ts. Only used to
// decide whether example newsletters need trimming — never applied to
// the style guide or the structured Newsletter Builder output, which are
// never trimmed or truncated.
const CHARS_PER_TOKEN_ESTIMATE = 4
const DEFAULT_MAX_EXAMPLE_TOKENS = 6000

/**
 * Priority order used only when trimming is required (lower = kept
 * longer). "coming-soon-example.md" is the sole representative of the
 * Coming Soon structure, so it's kept first. "whats-new-example.md" is
 * the primary What's New reference. The webhook example is supplementary
 * — same structure as whats-new, plus a real navigation/steps block — so
 * it is trimmed first if space is tight.
 */
const EXAMPLE_TRIM_PRIORITY: Record<string, number> = {
  "coming-soon-example.md": 0,
  "whats-new-example.md": 1,
  "rider-active-task-webhook-example.md": 2,
}

function estimateTokens(text: string): number {
  return Math.ceil(text.length / CHARS_PER_TOKEN_ESTIMATE)
}

/**
 * Selects which loaded examples fit within the token budget, trimming
 * lowest-priority examples first. Always keeps at least one example.
 * Returns the kept examples in their original (document) order, not
 * priority order.
 */
export function selectExamplesWithinBudget(
  examples: LoadedExample[],
  maxExampleTokens: number = DEFAULT_MAX_EXAMPLE_TOKENS,
): LoadedExample[] {
  const byPriority = [...examples].sort(
    (a, b) => (EXAMPLE_TRIM_PRIORITY[a.filename] ?? 99) - (EXAMPLE_TRIM_PRIORITY[b.filename] ?? 99),
  )

  const kept: LoadedExample[] = []
  let runningTokens = 0

  for (const example of byPriority) {
    const exampleTokens = estimateTokens(example.content)
    if (kept.length > 0 && runningTokens + exampleTokens > maxExampleTokens) {
      break
    }
    kept.push(example)
    runningTokens += exampleTokens
  }

  const keptFilenames = new Set(kept.map((example) => example.filename))
  return examples.filter((example) => keptFilenames.has(example.filename))
}

function buildSystemInstructions(newsletterType: NewsletterType): string {
  return [
    "You are the Newsletter Writer for an internal product marketing platform.",
    "",
    "Your job is to write a single newsletter using ONLY the structured data",
    "provided below. Follow the attached style guide exactly. Study the",
    "attached example newsletters as your editorial reference for tone,",
    "structure, and formatting — do not copy their content, only their style.",
    "",
    `Newsletter type for this request: ${newsletterType}`,
    "",
    "Hard rules:",
    "- Never invent information not present in the structured data.",
    "- Never mention or reference a null/missing field — omit it entirely.",
    "- Use the exact navigationPath and steps arrays verbatim — never paraphrase.",
    '- Follow the "What\'s New" or "Coming Soon" structure exactly as defined',
    "  in the style guide, based on the newsletter type above (or both",
    '  structures, in that order, if the type is "mixed").',
    "- Output only the newsletter itself — no commentary, no meta-discussion.",
  ].join("\n")
}

/**
 * Assembles the final Writer prompt from the style guide, the relevant
 * example newsletters (trimmed to fit the token budget if needed), and
 * the structured Newsletter Builder output. Never includes raw PDFs or
 * raw extracted text — only validated structured data reaches this
 * function via `builderOutput`.
 */
export function buildWriterPrompt(params: BuildPromptParams): BuildPromptResult {
  const { builderOutput, styleGuide, examples, maxExampleTokens } = params
  const selectedExamples = selectExamplesWithinBudget(examples, maxExampleTokens)

  const sections = [
    buildSystemInstructions(builderOutput.newsletterType),
    `## Style Guide\n\n${styleGuide.content}`,
    `## Example Newsletters\n\n${selectedExamples
      .map((example) => `### Example: ${example.filename}\n\n${example.content}`)
      .join("\n\n---\n\n")}`,
    `## Structured Newsletter Builder Output\n\nThis is the complete, validated source of truth. Do not add, remove, or infer anything beyond it.\n\n\`\`\`json\n${JSON.stringify(builderOutput, null, 2)}\n\`\`\``,
  ]

  return {
    prompt: sections.join("\n\n---\n\n"),
    selectedExamples,
  }
}
