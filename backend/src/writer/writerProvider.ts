import Groq from "groq-sdk"
import { env } from "../config/env"
import { GroqProviderError } from "../ai/errors"
import type { NewsletterBuilderOutput, NewsletterType } from "../newsletter/types"
import type { WriterEngineOutput } from "./types"
import { ModelNewsletterJsonSchema, type ModelNewsletterJson, type NewsletterJson } from "./newsletterOutput.schema"

const TEMPERATURE = 0.3

/**
 * A feature "counts as represented" in the generated newsletter when at
 * least this fraction of its significant (non-stopword) title words show
 * up as substrings in the newsletter text. This is a deliberately loose
 * fuzzy match — the Writer is expected to paraphrase titles into prose,
 * not quote them verbatim.
 */
const TITLE_WORD_MATCH_THRESHOLD = 0.6

const STOPWORDS = new Set([
  "the",
  "a",
  "an",
  "and",
  "or",
  "to",
  "for",
  "of",
  "in",
  "on",
  "with",
  "by",
  "is",
  "are",
  "this",
  "that",
  "your",
  "you",
])

/**
 * Patterns indicating the model explained itself instead of just writing
 * the newsletter. Not exhaustive — covers the explicitly named examples
 * plus a few obvious common variants.
 */
const META_COMMENTARY_PATTERNS: RegExp[] = [
  /^\s*here('|’)?s (is )?the newsletter/i,
  /^\s*here is the newsletter/i,
  /\bas an ai\b/i,
  /^\s*certainly[,!]?\s/i,
  /^\s*sure[,!]?\s+here/i,
  /based on the (provided|extracted) data/i,
  /\bI(?:'ve| have) generated\b/i,
  /\bI(?:'ve| have) written\b/i,
]

/** Unfilled template stubs that indicate a broken/incomplete generation. */
const PLACEHOLDER_PATTERNS: RegExp[] = [/lorem ipsum/i, /\btbd\b/i, /\btodo\b/i, /\[insert[^\]]*]/i]

/** Slot 5's hard ceiling — not a target. See promptBuilder.ts. */
const MAX_WHATS_NEW_ITEMS = 4

// Code-assembled, never requested from the model (see promptBuilder.ts).
const WHATS_NEXT_LINE = "Something exciting is coming soon - Stay tuned !!"
// No "What's Next" teaser for a Coming Soon newsletter — documented as
// never observed in real Coming Soon source material, and describing
// planned items shouldn't tease a second, unspecified thing beyond them.
// Represented as an empty string; the renderer omits the section when empty.
const NO_WHATS_NEXT = ""
const STATIC_FOOTER = {
  address: "M3M Urbana Business Park, Sector 67",
  city: "Gurugram, Haryana (122101)",
  websiteUrl: "https://pidge.in/",
}

export interface WriterProviderMetadata {
  model: string
  generationTimeMs: number
  promptTokens?: number
  completionTokens?: number
  totalTokens?: number
  possibleOmissions: boolean
  missingSections: string[]
  /** Feature titles whose navigationPath was deterministically inserted because the model never rendered it verbatim within the retry budget. */
  navigationPathsPatched: string[]
}

export interface GenerateNewsletterResult {
  newsletter: NewsletterJson
  metadata: WriterProviderMetadata
}

/**
 * Thrown only when generation fails the hard VALIDATION checks (empty
 * output, code fences, meta-commentary, unfilled placeholders) on both
 * the original attempt and the single retry. Structure Validation and
 * the Completeness Check never throw — they surface as metadata flags.
 */
export class NewsletterGenerationError extends Error {
  readonly attemptFailures: string[]

  constructor(attemptFailures: string[]) {
    super(
      `Newsletter generation failed validation after ${attemptFailures.length} attempt(s): ` +
        attemptFailures.join(" | "),
    )
    this.name = "NewsletterGenerationError"
    this.attemptFailures = attemptFailures
  }
}

/**
 * Pulls the structured Newsletter Builder JSON back out of the prompt the
 * Writer Engine assembled, so this module never needs its own copy of the
 * Builder output and never needs Writer Engine or Newsletter Builder to be
 * modified. Returns null if the prompt doesn't contain a parseable block
 * (e.g. a hand-built prompt in a test) — callers treat that as "no
 * feature titles available," not an error.
 */
export function extractBuilderOutputFromPrompt(prompt: string): NewsletterBuilderOutput | null {
  const match = prompt.match(/## Structured Newsletter Builder Output[\s\S]*?```json\n([\s\S]*?)\n```/)
  if (!match) return null

  try {
    return JSON.parse(match[1]) as NewsletterBuilderOutput
  } catch {
    return null
  }
}

/**
 * All distinct feature titles the Builder supplied — whatsNew, comingSoon,
 * and unclassified combined, since the completeness check exists to catch
 * whole personas/use-cases being dropped, and unclassified features are
 * still real source-document content.
 */
export function getDistinctFeatureTitles(builderOutput: NewsletterBuilderOutput): string[] {
  const titles = [...builderOutput.whatsNew, ...builderOutput.comingSoon, ...builderOutput.unclassified].map(
    (feature) => feature.title.trim(),
  )
  return [...new Set(titles)]
}

function significantWords(title: string): string[] {
  return title
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((word) => word.length > 2 && !STOPWORDS.has(word))
}

function isTitleRepresented(title: string, normalizedText: string): boolean {
  const words = significantWords(title)
  if (words.length === 0) {
    return normalizedText.includes(title.toLowerCase())
  }
  const matchedCount = words.filter((word) => normalizedText.includes(word)).length
  return matchedCount / words.length >= TITLE_WORD_MATCH_THRESHOLD
}

/**
 * Repurposed for the slot-filling design: the old 80%-title-coverage bar
 * assumed a newsletter should try to mention every supplied feature. The
 * new design deliberately curates down to 3-4 items (Slot 5), so "most
 * titles are absent" is now the CORRECT, expected case, not an omission.
 * This now flags the much rarer, much more meaningful failure: the
 * output doesn't correlate with the JSON at all — none of the supplied
 * titles show up in any form, which is what a hallucinated/off-topic
 * generation looks like. Curating 3 out of 27 titles is fine; recognizing
 * zero of them is not.
 */
export function checkPossibleOmissions(newsletter: ModelNewsletterJson, featureTitles: string[]): boolean {
  if (featureTitles.length === 0) return false

  const normalizedText = flattenModelJsonText(newsletter).toLowerCase()
  const representedCount = featureTitles.filter((title) => isTitleRepresented(title, normalizedText)).length

  return representedCount === 0
}

/** Every text field the model produced, concatenated for substring/pattern scanning. */
function flattenModelJsonText(newsletter: ModelNewsletterJson): string {
  return [
    newsletter.title,
    newsletter.intro,
    newsletter.whyBuilt ?? "",
    ...newsletter.items.flatMap((item) => [item.name, item.body]),
    ...newsletter.meansToYou,
  ].join("\n")
}

/** Slot 5 hard-limit violation, as its own reason — a real rejection, not a warning. */
export function findItemCountViolations(newsletter: ModelNewsletterJson): string[] {
  const count = newsletter.items.length
  return count > MAX_WHATS_NEW_ITEMS
    ? [`items has ${count} entries, exceeding the hard limit of ${MAX_WHATS_NEW_ITEMS}.`]
    : []
}

/**
 * The single navigation path Slot 4 surfaces — the first non-empty
 * navigationPath found (in document order) among the features relevant
 * to this newsletter's type. This becomes the `navigation` field verbatim
 * (the frontend joins it into "You can find it in: X → Y → Z"), not a
 * per-item bullet under each feature — the model is never asked for this
 * field at all (see promptBuilder.ts), so title-position-based matching
 * (the old markdown-era approach) doesn't apply here: there's no
 * per-feature location to find, and it also used to silently break once
 * Slot 5 started grouping/renaming titles, since the JSON's original
 * title text often didn't appear verbatim in the model's rewritten output.
 */
function getPrimaryNavigationPath(builderOutput: NewsletterBuilderOutput): string[] | null {
  const items = builderOutput.newsletterType === "coming_soon" ? builderOutput.comingSoon : builderOutput.whatsNew
  const withPath = items.find((item) => item.navigationPath.length > 0)
  return withPath?.navigationPath ?? null
}

/** Warning-only: names of expected sections not present in the structured output. */
export function findMissingSections(newsletter: ModelNewsletterJson, newsletterType: NewsletterType): string[] {
  const missing: string[] = []
  if (newsletter.items.length === 0) {
    missing.push(newsletterType === "coming_soon" ? "Coming Soon" : "What's New")
  }
  // "What This Means To You" is only expected for a whats_new/mixed release —
  // same asymmetry as before: Coming Soon items frequently have no
  // businessBenefit/userImpact content this early, so its absence there
  // isn't flagged.
  if (newsletterType !== "coming_soon" && newsletter.meansToYou.length === 0) {
    missing.push("What This Means To You")
  }
  return missing
}

interface ParsedModelJson {
  data: ModelNewsletterJson | null
  error: string | null
}

/**
 * Defensively parses the model's response into ModelNewsletterJsonSchema.
 * response_format: json_object should mean no fences ever appear, but
 * strips them if present anyway rather than trusting that unconditionally.
 */
function parseModelJson(rawText: string): ParsedModelJson {
  const stripped = rawText
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```\s*$/i, "")
    .trim()

  if (stripped.length === 0) {
    return { data: null, error: "Output is empty." }
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(stripped)
  } catch {
    return { data: null, error: "Output was not valid JSON." }
  }

  const validation = ModelNewsletterJsonSchema.safeParse(parsed)
  if (!validation.success) {
    return { data: null, error: `Output did not match the expected JSON shape: ${validation.error.message}` }
  }

  return { data: validation.data, error: null }
}

/**
 * Hard-rejection checks on an already-parsed, schema-valid response.
 * Deliberately does NOT check for the substring "coming soon" anywhere:
 * real approved newsletters legitimately contain phrasing like "Something
 * exciting is coming soon - Stay tuned!" in their closing section (added
 * in code, but this check runs against model text fields too), and
 * rejecting on that substring would false-positive on correct output.
 */
export function findRejectionReasons(newsletter: ModelNewsletterJson): string[] {
  const reasons: string[] = []
  const text = flattenModelJsonText(newsletter)

  if (META_COMMENTARY_PATTERNS.some((pattern) => pattern.test(text))) {
    reasons.push("Output contains apparent model meta-commentary.")
  }

  if (PLACEHOLDER_PATTERNS.some((pattern) => pattern.test(text))) {
    reasons.push("Output contains an unfilled placeholder token.")
  }

  return reasons
}

/**
 * Converts a Writer Engine prompt into a finished newsletter via Groq.
 * Exposes exactly one public method. Reuses the shared GROQ_API_KEY /
 * GROQ_MODEL configuration and the existing GroqProviderError class — no
 * extraction-specific logic (prompt loading, JSON mode, schema
 * validation) is duplicated here, since the Writer's job is different.
 */
export class WriterProvider {
  private readonly client: Groq
  private readonly model: string

  constructor() {
    if (!env.groqApiKey) {
      throw new GroqProviderError("GROQ_API_KEY is not configured")
    }

    this.client = new Groq({ apiKey: env.groqApiKey })
    this.model = env.groqModel
  }

  async generateNewsletter(input: Pick<WriterEngineOutput, "prompt" | "metadata">): Promise<GenerateNewsletterResult> {
    const { prompt, metadata } = input
    const newsletterType = metadata.newsletterType

    const builderOutput = extractBuilderOutputFromPrompt(prompt)
    const featureTitles = builderOutput ? getDistinctFeatureTitles(builderOutput) : []

    const attemptFailures: string[] = []
    // Navigation (Slot 4), whatsNext, and footer are now ALWAYS code-
    // assembled, never model-produced — the model isn't even asked for
    // these keys (see promptBuilder.ts), so they're never a retry trigger.
    // Structural/parse failures and the Slot 5 item-count ceiling are the
    // only real rejection reasons now.
    const maxAttempts = 3

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const startedAt = Date.now()
      const completion = await this.requestCompletion(prompt)
      const generationTimeMs = Date.now() - startedAt
      const rawText = completion.choices[0]?.message?.content ?? ""

      const { data: modelJson, error: parseError } = parseModelJson(rawText)

      if (!modelJson) {
        attemptFailures.push(`Attempt ${attempt}: ${parseError}`)
        continue
      }

      const rejectionReasons = [...findRejectionReasons(modelJson), ...findItemCountViolations(modelJson)]

      if (rejectionReasons.length === 0) {
        const navigation = builderOutput ? (getPrimaryNavigationPath(builderOutput) ?? []) : []
        const newsletter: NewsletterJson = {
          ...modelJson,
          navigation,
          whatsNext: newsletterType === "coming_soon" ? NO_WHATS_NEXT : WHATS_NEXT_LINE,
          footer: STATIC_FOOTER,
        }

        return {
          newsletter,
          metadata: {
            model: this.model,
            generationTimeMs,
            promptTokens: completion.usage?.prompt_tokens,
            completionTokens: completion.usage?.completion_tokens,
            totalTokens: completion.usage?.total_tokens,
            possibleOmissions: checkPossibleOmissions(modelJson, featureTitles),
            missingSections: findMissingSections(modelJson, newsletterType),
            navigationPathsPatched: navigation.length > 0 ? [navigation.join(" → ")] : [],
          },
        }
      }

      attemptFailures.push(`Attempt ${attempt}: ${rejectionReasons.join("; ")}`)
    }

    throw new NewsletterGenerationError(attemptFailures)
  }

  private async requestCompletion(prompt: string): Promise<Groq.Chat.Completions.ChatCompletion> {
    try {
      return await this.client.chat.completions.create({
        model: this.model,
        temperature: TEMPERATURE,
        response_format: { type: "json_object" },
        messages: [{ role: "user", content: prompt }],
      })
    } catch (error) {
      throw new GroqProviderError(
        error instanceof Error ? error.message : "Unknown error calling the Groq API",
        error,
      )
    }
  }
}
