import Groq from "groq-sdk"
import { env } from "../config/env"
import { GroqProviderError } from "../ai/errors"
import type { NewsletterBuilderOutput, NewsletterType } from "../newsletter/types"
import type { WriterEngineOutput } from "./types"

const TEMPERATURE = 0.3

/**
 * A feature "counts as represented" in the generated newsletter when at
 * least this fraction of its significant (non-stopword) title words show
 * up as substrings in the newsletter text. This is a deliberately loose
 * fuzzy match — the Writer is expected to paraphrase titles into prose,
 * not quote them verbatim.
 */
const TITLE_WORD_MATCH_THRESHOLD = 0.6

/**
 * possibleOmissions is flagged when fewer than this fraction of the
 * Builder's supplied distinct feature titles appear to be represented.
 * Chosen per the task's own suggested ~80% figure — a deliberately
 * generous bar so this stays a "heads up" signal, not a strict gate.
 */
const COMPLETENESS_THRESHOLD = 0.8

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

interface RequiredHeading {
  label: string
  /** Any one of these (case-insensitive substrings) satisfies this heading. */
  patterns: string[]
}

// "Why We Built This" and "Why This Matters To You" are both documented in
// newsletterStyle.md (Section 6) as real, equally valid labels observed in
// approved newsletters for the same conceptual section — either satisfies
// this requirement.
const WHATS_NEW_HEADINGS: RequiredHeading[] = [
  { label: "Why We Built This", patterns: ["why we built this", "why this matters to you"] },
  { label: "What's New!", patterns: ["what's new", "whats new"] },
  { label: "What This Means To You", patterns: ["what this means to you"] },
]

const COMING_SOON_HEADINGS: RequiredHeading[] = [
  { label: "Why This Is Changing", patterns: ["why this is changing"] },
  { label: "Key Changes", patterns: ["key changes"] },
]

export interface WriterProviderMetadata {
  model: string
  generationTimeMs: number
  promptTokens?: number
  completionTokens?: number
  totalTokens?: number
  possibleOmissions: boolean
  missingSections: string[]
}

export interface GenerateNewsletterResult {
  newsletter: string
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
 * Heuristic, not a guarantee: true when meaningfully fewer than
 * COMPLETENESS_THRESHOLD of the supplied feature titles appear (even
 * paraphrased) in the generated text. With zero supplied titles there is
 * nothing to omit, so this always returns false in that case.
 */
export function checkPossibleOmissions(newsletterText: string, featureTitles: string[]): boolean {
  if (featureTitles.length === 0) return false

  const normalizedText = newsletterText.toLowerCase()
  const representedCount = featureTitles.filter((title) => isTitleRepresented(title, normalizedText)).length

  return representedCount / featureTitles.length < COMPLETENESS_THRESHOLD
}

function requiredHeadingsFor(newsletterType: NewsletterType): RequiredHeading[] {
  if (newsletterType === "whats_new") return WHATS_NEW_HEADINGS
  if (newsletterType === "coming_soon") return COMING_SOON_HEADINGS
  return [...WHATS_NEW_HEADINGS, ...COMING_SOON_HEADINGS]
}

/** Warning-only: names of required section headings not found in the output. */
export function findMissingSections(newsletterText: string, newsletterType: NewsletterType): string[] {
  const normalized = newsletterText.toLowerCase()
  return requiredHeadingsFor(newsletterType)
    .filter((heading) => !heading.patterns.some((pattern) => normalized.includes(pattern)))
    .map((heading) => heading.label)
}

/**
 * Hard-rejection checks only. Returns a list of failure reasons — empty
 * means the output passed. Deliberately does NOT check for the substring
 * "coming soon" anywhere: real approved newsletters legitimately contain
 * phrasing like "Something exciting is coming soon - Stay tuned!" in their
 * closing section, and rejecting on that substring would false-positive
 * on correct output.
 */
export function findRejectionReasons(text: string): string[] {
  const reasons: string[] = []

  if (text.trim().length === 0) {
    reasons.push("Output is empty.")
    return reasons
  }

  if (text.includes("```")) {
    reasons.push("Output contains markdown code fences.")
  }

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
    const maxAttempts = 2

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const startedAt = Date.now()
      const completion = await this.requestCompletion(prompt)
      const generationTimeMs = Date.now() - startedAt
      const text = completion.choices[0]?.message?.content ?? ""

      const rejectionReasons = findRejectionReasons(text)

      if (rejectionReasons.length === 0) {
        return {
          newsletter: text.trim(),
          metadata: {
            model: this.model,
            generationTimeMs,
            promptTokens: completion.usage?.prompt_tokens,
            completionTokens: completion.usage?.completion_tokens,
            totalTokens: completion.usage?.total_tokens,
            possibleOmissions: checkPossibleOmissions(text, featureTitles),
            missingSections: findMissingSections(text, newsletterType),
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
