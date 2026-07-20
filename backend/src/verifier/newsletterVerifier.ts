import Groq from "groq-sdk"
import { z } from "zod"
import { env } from "../config/env"
import type { NewsletterFeatureItem } from "../newsletter/types"
import type { NewsletterJson } from "../writer/newsletterOutput.schema"

/**
 * NEWSLETTER VERIFIER — runs AFTER the Writer, BEFORE the newsletter reaches
 * the user. DETECT AND REPORT ONLY: never blocks, regenerates, or edits the
 * newsletter. Proves the "doesn't fabricate" property against the exact
 * items the Writer actually saw (WriterEngineOutput.sourceItems, from
 * writerEngine.ts's prepareWriterPrompt) rather than the raw, pre-filter
 * Builder selection — items dropped by the parent/child dedupe or the
 * null-description filter were never shown to the model, so it would be
 * misleading to call their absence "dropped by the Writer."
 */

export interface UngroundedClaim {
  claim: string
  why_ungrounded: string
}

export interface VerificationReport {
  passed: boolean
  /** Actual fabrication signals. These alone determine `passed`. */
  blocking: {
    fabricatedPaths: string[]
    ungroundedItems: string[]
  }
  /** Useful review signals that are expected on otherwise-correct drafts. */
  advisory: {
    droppedFeatures: string[]
    ungroundedClaims: UngroundedClaim[]
  }
  /**
   * Additive — not one of the four gating arrays. Set only when Check 3's
   * live call could not be completed (network/quota/validation failure).
   * `ungroundedClaims: []` in that case means "not checked," not "checked
   * and clean" — collapsing those two states into one boolean would be a
   * dishonest signal, so this stays visible separately.
   */
  check3Error: string | null
}

function arraysEqual(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((value, index) => value === b[index])
}

/**
 * CHECK 1 — code, zero tokens. `newsletter.navigation` is never
 * model-authored (see writerProvider.ts's getPrimaryNavigationPath) — it's
 * copied verbatim from a source feature's navigationPath. Exact array
 * equality is the right comparison here, unlike item names (Check 2),
 * because there is no legitimate rewording path for this field the way
 * there is for feature titles.
 */
export function checkNavigationGrounding(newsletter: NewsletterJson, sourceItems: NewsletterFeatureItem[]): string[] {
  if (newsletter.navigation.length === 0) return []
  const isGrounded = sourceItems.some((item) => arraysEqual(item.navigationPath, newsletter.navigation))
  return isGrounded ? [] : [newsletter.navigation.join(" → ")]
}

const STOPWORDS = new Set(["the", "a", "an", "and", "or", "to", "for", "of", "in", "on", "with", "by", "is", "are", "this", "that"])

function significantWords(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((word) => word.length > 2 && !STOPWORDS.has(word)),
  )
}

/**
 * Symmetric word-overlap, ratio taken against the SHORTER title's word
 * count (not the longer one) — deliberately calibrated against real
 * output, not assumed. Slot 5 explicitly instructs the model to rename
 * features into shorter reader-facing names (e.g. source "Control Tower
 * Team: End-to-End Spot Shift Management" legitimately becomes newsletter
 * item "Control Tower Team View"). An exact-match or longer-denominator
 * ratio would flag every correctly-grounded renamed item as fabricated.
 * Verified against real harness output before use — see the task report.
 */
function titlesLikelyMatch(a: string, b: string): boolean {
  const wordsA = significantWords(a)
  const wordsB = significantWords(b)
  if (wordsA.size === 0 || wordsB.size === 0) return false

  let shared = 0
  for (const word of wordsA) if (wordsB.has(word)) shared++

  const ratio = shared / Math.min(wordsA.size, wordsB.size)
  return ratio >= 0.5
}

/**
 * CHECK 2 — code, zero tokens.
 * ungroundedItems: newsletter items with no matching source feature —
 * this is the real fabrication signal.
 * droppedFeatures: the reverse — source features that didn't make it into
 * the newsletter. Under the current architecture this will often be
 * non-empty even on a perfectly correct newsletter, because Slot 5
 * deliberately curates down to 3-4 items from a much larger source set
 * (that curation is the intended, correct behavior, not a defect). Reported
 * honestly regardless — see the task report for the real numbers this
 * produces and the resulting tension with the "passed" gate.
 */
export function checkFeatureCoverage(
  newsletter: NewsletterJson,
  sourceItems: NewsletterFeatureItem[],
): { ungroundedItems: string[]; droppedFeatures: string[] } {
  const ungroundedItems = newsletter.items
    .filter((item) => !sourceItems.some((source) => titlesLikelyMatch(source.title, item.name)))
    .map((item) => item.name)

  const droppedFeatures = sourceItems
    .filter((source) => !newsletter.items.some((item) => titlesLikelyMatch(source.title, item.name)))
    .map((source) => source.title)

  return { ungroundedItems, droppedFeatures }
}

/**
 * Deliberately omits navigation, whatsNext, and footer — all three are
 * code-inserted (see writerProvider.ts), never model-authored, and never
 * sourced from this JSON in the first place (whatsNext is a fixed string,
 * footer is fixed company info, navigation is grounded separately and
 * exactly by Check 1). Including them here produced a real false positive
 * during testing: the model flagged the static "Something exciting is
 * coming soon" line as an ungrounded claim, because nothing in the JSON
 * supports it — true, but irrelevant, since it was never supposed to come
 * from the JSON. Check 3 should only ever see the portion of the
 * newsletter an AI actually wrote.
 */
function renderNewsletterPlainText(newsletter: NewsletterJson, itemsHeading: string): string {
  const lines: string[] = [newsletter.title, "", newsletter.intro]
  if (newsletter.whyBuilt) lines.push("", "Why We Built This", newsletter.whyBuilt)
  if (newsletter.items.length > 0) {
    lines.push("", itemsHeading)
    for (const item of newsletter.items) lines.push("", item.name, item.body)
  }
  if (newsletter.meansToYou.length > 0) {
    lines.push("", "What This Means To You")
    for (const point of newsletter.meansToYou) lines.push(`- ${point}`)
  }
  return lines.join("\n")
}

const UngroundedClaimSchema = z.object({ claim: z.string(), why_ungrounded: z.string() }).strict()
// Wrapped in an object, not a bare array — Groq's json_object response
// format requires a top-level JSON object. Unwrapped back to a plain array
// in VerificationReport.ungroundedClaims below.
const Check3ResponseSchema = z.object({ ungroundedClaims: z.array(UngroundedClaimSchema) }).strict()

/**
 * CHECK 3 — one live call, ~3K tokens. Deliberately given ONLY the
 * rendered newsletter text and the source JSON — no style examples, no
 * source document, no other context. Reference examples are the proven
 * fabrication vector in this project (see promptBuilder.ts's own
 * history) — reintroducing any "here's what a good/bad claim looks like"
 * example here would risk the same failure mode this check exists to
 * catch.
 */
const CHECK3_SYSTEM_PROMPT = [
  "You compare a newsletter's text against a JSON list of source features it",
  "was supposedly built from. List every factual claim in the newsletter",
  "that is NOT supported by the JSON: invented rationale, invented features,",
  "invented dates or timelines, invented benefits — anything stated as fact",
  "that you cannot trace to a specific field in the JSON.",
  "",
  "Flag a claim ONLY if its core FACT is absent from the JSON. If the fact",
  "is present and only the WORDING differs, it is grounded — do NOT flag it.",
  "Paraphrasing, summarizing, and rewriting in second person are required of",
  "the writer and are never fabrication.",
  "",
  "Before flagging, ask: is there ANY field in the JSON (including",
  "problemStatement, whyBuilt, releasePlan, businessBenefit, userImpact, or",
  "descriptions) that supports this fact? If yes, it is grounded.",
  "Treat a fact as supported when the JSON directly states it OR clearly",
  "entails it through an ordinary summary or benefit-focused rewrite. Do not",
  "require the same actor, subject, or exact wording. Headlines and",
  "promotional phrasing that merely summarize a supported feature are not",
  "separate factual claims.",
  "Use a high-precision standard: when support is plausible, do not flag.",
  "Qualitative language about efficiency, visibility, workflow, or user",
  "impact is grounded when the JSON supplies the underlying capability or",
  "rationale. Flag only a concrete, materially new fact whose absence is",
  "unambiguous.",
  "A reportable claim must introduce a specific new entity, system behavior,",
  "rule, amount, date, threshold, configuration, capability, or outcome that",
  "is absent from every source field. Do not report an inference, consequence,",
  "evaluation, or general restatement. When in doubt, return no flag: a false",
  "positive is worse than an omitted borderline claim.",
  "",
  "For every flagged claim, why_ungrounded must state the core fact and why",
  "no JSON field supports it. Do not flag a claim if you cannot give that",
  "specific reason.",
  "",
  'Respond with ONLY a JSON object of exactly this shape, nothing else:',
  '{ "ungroundedClaims": [ { "claim": "string", "why_ungrounded": "string" } ] }',
  "",
  "If nothing is ungrounded, return an empty array for ungroundedClaims.",
].join("\n")

export interface DocumentContext {
  problemStatement: string | null
  whyBuilt: string | null
  releasePlan: string[]
}

export async function checkUngroundedClaims(
  newsletter: NewsletterJson,
  sourceItems: NewsletterFeatureItem[],
  itemsHeading: string,
  documentContext: DocumentContext,
): Promise<{ ungroundedClaims: UngroundedClaim[]; error: string | null }> {
  if (!env.groqApiKey) {
    return { ungroundedClaims: [], error: "GROQ_API_KEY is not configured" }
  }

  const newsletterText = renderNewsletterPlainText(newsletter, itemsHeading)
  // Document-level fields (problemStatement/whyBuilt/releasePlan) are a real
  // grounding source for Slot 2's intro and Slot 3's whyBuilt — found live:
  // without these, Check 3 has no way to know the intro/whyBuilt text IS
  // grounded, and flags legitimate, correctly-sourced content as fabricated
  // simply because it never saw the field it came from.
  const sourceJson = JSON.stringify({ ...documentContext, features: sourceItems }, null, 2)

  try {
    const client = new Groq({ apiKey: env.groqApiKey })
    const completion = await client.chat.completions.create({
      model: env.groqModel,
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: CHECK3_SYSTEM_PROMPT },
        { role: "user", content: `NEWSLETTER TEXT:\n${newsletterText}\n\n---\n\nSOURCE JSON:\n${sourceJson}` },
      ],
    })

    console.log(
      `[newsletterVerifier] Check 3 usage: prompt=${completion.usage?.prompt_tokens}, completion=${completion.usage?.completion_tokens}, total=${completion.usage?.total_tokens}`,
    )

    const raw = completion.choices[0]?.message?.content ?? ""
    const parsed: unknown = JSON.parse(raw)
    const validation = Check3ResponseSchema.safeParse(parsed)
    if (!validation.success) {
      return { ungroundedClaims: [], error: `Check 3 response failed validation: ${validation.error.message}` }
    }
    return { ungroundedClaims: validation.data.ungroundedClaims, error: null }
  } catch (error) {
    return { ungroundedClaims: [], error: error instanceof Error ? error.message : "Unknown error calling Groq for Check 3" }
  }
}

/**
 * Runs all three checks and assembles the final report. Never throws for
 * a Check 3 failure — logged via check3Error instead, so a Groq outage
 * never blocks the newsletter from reaching the user (the whole point of
 * "detect and report, never block").
 */
export async function verifyNewsletter(
  newsletter: NewsletterJson,
  sourceItems: NewsletterFeatureItem[],
  itemsHeading: string,
  documentContext: DocumentContext,
): Promise<VerificationReport> {
  const fabricatedPaths = checkNavigationGrounding(newsletter, sourceItems)
  const { ungroundedItems, droppedFeatures } = checkFeatureCoverage(newsletter, sourceItems)
  const { ungroundedClaims, error: check3Error } = await checkUngroundedClaims(newsletter, sourceItems, itemsHeading, documentContext)

  const passed = fabricatedPaths.length === 0 && ungroundedItems.length === 0

  const report: VerificationReport = {
    passed,
    blocking: { fabricatedPaths, ungroundedItems },
    advisory: { droppedFeatures, ungroundedClaims },
    check3Error,
  }

  console.log(`[newsletterVerifier] ${itemsHeading}:`, JSON.stringify(report, null, 2))

  return report
}
