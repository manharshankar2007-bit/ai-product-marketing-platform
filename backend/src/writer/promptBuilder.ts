import type { NewsletterType } from "../newsletter/types"
import type { BuildPromptParams, BuildPromptResult } from "./types"

/**
 * Bumped whenever the slot template or rules change — replaces the old
 * styleGuideVersion/exampleVersions hashes now that there's no style
 * guide or example file to hash.
 */
export const PROMPT_VERSION = "slot-v1"

/**
 * SLOT-FILLING PROMPT — replaces the example-imitation approach entirely.
 *
 * Root cause (proven by natural experiment, not inference): with one style
 * example (COD Handling) loaded, the newsletter fabricated COD content.
 * Adding a second example (One ID / Reference ID) didn't dilute the leak —
 * it added a second one. The examples were the vector. This prompt
 * contains ZERO reference newsletters and ZERO style guide document. The
 * model's only inputs are these slot instructions and the extraction JSON.
 *
 * Output SHAPE is JSON, not markdown (see newsletterOutput.schema.ts):
 * the model returns only { title, intro, whyBuilt, items, meansToYou }.
 * Navigation, whatsNext, and footer are never requested from the model —
 * they're assembled in code (writerProvider.ts) and merged in afterward.
 * This is a delivery-format change only; every field's content rule below
 * is the same rule the old markdown template enforced.
 */
function buildSlotInstructions(newsletterType: NewsletterType): string {
  const whatsNewLabel = newsletterType === "coming_soon" ? "Coming Soon" : "What's New"
  const tense = newsletterType === "coming_soon" ? "future" : "present"

  return [
    `You are filling in FIXED "${whatsNewLabel}" newsletter content from`,
    "structured JSON data.",
    "You are NOT imitating a style, a tone, or any other document. There is no",
    "reference newsletter attached to this prompt, and there never will be —",
    "your only source of information is the JSON provided below.",
    "",
    "=== ABSOLUTE RULES ===",
    "",
    "- Every fact in your output must trace to a field in the JSON you were",
    "  given. If a field has no source in the JSON, omit it. Never fill a",
    "  field from memory, inference, or any other document.",
    "- Dates, timelines, and product names may only be reproduced verbatim",
    "  from the JSON. Never construct or complete one.",
    "- Never mention a null or missing field. Omit it entirely — do not write",
    '  "not specified" or any equivalent filler.',
    "- Respond with ONLY a single JSON object — no markdown, no code fences,",
    "  no commentary before or after, no meta-discussion.",
    "",
    "=== OUTPUT SHAPE — respond with exactly these keys, nothing else ===",
    "",
    "{",
    '  "title": string,',
    '  "intro": string,',
    '  "whyBuilt": string or null,',
    '  "items": [ { "name": string, "body": string }, ... ],',
    '  "meansToYou": [string, ...]',
    "}",
    "",
    'Do not include "navigation", "whatsNext", or "footer" keys — those are',
    "assembled separately, outside your response.",
    "",
    "=== FIELD RULES — fill each field exactly as instructed ===",
    "",
    "title",
    'Punchy, benefit-led, one line: "<Thing>: <Benefit>!" — <Thing> and',
    "<Benefit> must both come from the JSON's feature titles/descriptions.",
    "",
    "intro",
    `2-3 sentences, second person, ${tense} tense: the operational problem`,
    "this addresses, then what's shipping. Draw only from the JSON's feature",
    "descriptions and businessBenefit fields.",
    "",
    'whyBuilt — DEFAULT ASSUMPTION: this is null. The current schema usually',
    "carries no dedicated rationale field, so the default case is the common",
    "case, not the exception.",
    "",
    'ONLY IF you can point to a specific JSON field that states WHY this',
    "release exists (as opposed to what it does — a description of what a",
    "feature does is NOT a rationale for the release), set whyBuilt to 2-3",
    "sentences using that field.",
    "",
    'If you cannot point to such a field: whyBuilt MUST be null. Do not',
    'write a sentence stating that no rationale was provided, found, or',
    "specified — a string like that is itself a violation, exactly as much",
    "as inventing a rationale would be. Both are writing about a field that",
    "isn't there. The only correct value is null.",
    "",
    "items",
    "HARD LIMIT: 3-4 items MAXIMUM. This is not a target, it is a ceiling —",
    "output exceeding 4 items will be rejected and you will be asked to",
    "retry. The current failure mode is dumping ~20 items flat; a real",
    "newsletter never does this.",
    "",
    "4 is a maximum, not a target. Output only as many items as have real,",
    "distinct content. Two strong items make a better newsletter than four",
    "padded ones. Never pad to reach the limit.",
    "",
    "SELECTION RULE: first, check whether the JSON contains a release-plan",
    "or release-notes statement that explicitly names which views, personas,",
    "or items to announce (e.g. a statement listing specific numbered items",
    "to include). If one exists, use EXACTLY those items and nothing else —",
    "it is the answer, not a suggestion. Otherwise, select the items a",
    "customer would actually notice and care about (up to 4, no fewer than",
    "the content genuinely supports). Internal implementation detail — a",
    'tab name, an internal flow label, a heading like "Flow 4 — Completed',
    'Tab: Post-Shift Analytics" — is never a newsletter item on its own.',
    "GROUP related JSON entries into one reader-facing feature rather than",
    "listing each JSON heading as a separate item.",
    "",
    'FORMAT: each item is { "name": <reader-facing name>, "body": <2-4',
    'sentence paragraph> }. Example:',
    "",
    '{ "name": "Forward Orders/Reverse Orders", "body": "Pinpoints',
    "single-hub pickup locations alongside multiple drop destinations,",
    "featuring a left-hand summary panel of order counts per hub and a",
    'quick-reset map button for both forward and reverse orders." }',
    "",
    "REWRITE every sentence in second person, benefit-first — never paste a",
    'JSON description verbatim. Raw source-document phrasing ("should be',
    'able to", "hard dependency", "their TL", or similar internal/PRD voice)',
    "must never appear in your output — if the JSON's own wording reads",
    "that way, rewrite it into how a person would actually describe the",
    "benefit to a colleague.",
    "",
    "meansToYou",
    "2-6 short strings, one per array entry. Source ONLY from the JSON's",
    "businessBenefit and userImpact fields — nowhere else. If neither field",
    "has any content anywhere in the JSON, meansToYou is an empty array.",
  ].join("\n")
}

/**
 * Assembles the Writer prompt from the slot instructions and the
 * structured Newsletter Builder output only. No style guide, no example
 * newsletters, no source document — nothing else reaches the model.
 */
export function buildWriterPrompt(params: BuildPromptParams): BuildPromptResult {
  const { builderOutput } = params

  const sections = [
    buildSlotInstructions(builderOutput.newsletterType),
    `## Structured Newsletter Builder Output\n\nThis is the complete, validated source of truth. Do not add, remove, or infer anything beyond it.\n\n\`\`\`json\n${JSON.stringify(builderOutput, null, 2)}\n\`\`\``,
  ]

  return {
    prompt: sections.join("\n\n---\n\n"),
  }
}
