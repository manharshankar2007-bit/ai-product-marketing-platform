import type { NewsletterBuilderOutput, NewsletterFeatureItem, NewsletterType } from "../newsletter/types"
import type { BuildPromptParams, BuildPromptResult } from "./types"

/**
 * Fields the Writer actually needs. `title`/`description`/`businessBenefit`/
 * `userImpact`/`status` feed the model's own prose; `navigationPath` must
 * stay because writerProvider.ts re-parses this EXACT serialized JSON back
 * out of the prompt string (extractBuilderOutputFromPrompt) to power
 * getPrimaryNavigationPath — Slot 4's navigation line is code-assembled
 * from that re-parsed field, not written by the model, so it can't be
 * dropped the way it safely is from the Verifier's payload (which passes a
 * real object, never a re-parsed prompt string). `configuration`, `steps`,
 * `limitations`, `rolloutNotes`, `parentTitle`, `source`, and `kind` are
 * never referenced by any slot instruction or by any downstream re-parse —
 * pure payload weight that scales with feature count for no benefit.
 */
function writerFacingFeature(item: NewsletterFeatureItem) {
  return {
    title: item.title,
    status: item.status,
    description: item.description,
    businessBenefit: item.businessBenefit,
    userImpact: item.userImpact,
    navigationPath: item.navigationPath,
  }
}

/** Same trim applied to every feature bucket; `warnings` is Builder's own diagnostic info and is never needed by the model's writing task. */
function writerFacingBuilderOutput(builderOutput: NewsletterBuilderOutput) {
  return {
    ...builderOutput,
    whatsNew: builderOutput.whatsNew.map(writerFacingFeature),
    comingSoon: builderOutput.comingSoon.map(writerFacingFeature),
    unclassified: builderOutput.unclassified.map(writerFacingFeature),
    warnings: undefined,
  }
}

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
    `2-3 sentences, second person, ${tense} tense. The operational-problem`,
    "sentence(s) must come ONLY from the JSON's top-level metadata.problemStatement",
    "field, used verbatim-in-substance — rephrase into second person, but never",
    "invent a different problem, domain, scenario, or specific detail beyond",
    "what that field states. If metadata.problemStatement is null or absent,",
    "OMIT the problem-framing sentence entirely and open directly with what's",
    "shipping instead — do not substitute a plausible-sounding generic problem",
    "(e.g. dispatcher scheduling, vehicle availability, double-booking — or any",
    "other invented operational scenario) when the field is empty. The",
    "what's-shipping portion draws only from the JSON's feature descriptions",
    "and businessBenefit fields, as before.",
    "",
    "whyBuilt — first choice: if the JSON's top-level metadata.whyBuilt field",
    "is non-null, use its content verbatim-in-substance (2-3 sentences) —",
    "never paraphrase it into a different scenario, domain, or invented",
    "detail beyond what that field states.",
    "",
    "If metadata.whyBuilt is null, SYNTHESIZE a rationale by reasoning over",
    "metadata.problemStatement and the features' own description/",
    "businessBenefit fields — connect facts already stated in the JSON into",
    "why this was likely built (e.g. \"this closes the gap described in the",
    "problem statement\"). Synthesis means recombining what the JSON already",
    "says, in your own words — it does NOT mean introducing a new entity,",
    "team, role, workflow, or domain that isn't named anywhere in the JSON.",
    "If problemStatement is also null and no feature has any",
    "businessBenefit anywhere, there is nothing to reason from — whyBuilt is",
    "null. Do not write a sentence stating that no rationale was found —",
    "that is itself a violation, exactly as much as inventing one is.",
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
    "2-6 short strings, one per array entry. First choice: the JSON's",
    "businessBenefit and userImpact fields. If neither exists for a feature",
    "you're including, you may synthesize a benefit by reasoning over that",
    "feature's own description — state the practical upside of what the",
    "description already says the feature does, without inventing a new",
    "capability, number, or outcome the description doesn't support. If a",
    "feature's description gives you nothing to reason a benefit from",
    "either, skip it rather than padding with a generic line. meansToYou is",
    "an empty array only if this yields nothing across every feature.",
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
    `## Structured Newsletter Builder Output\n\nThis is the complete, validated source of truth. Do not add, remove, or infer anything beyond it.\n\n\`\`\`json\n${JSON.stringify(writerFacingBuilderOutput(builderOutput), null, 2)}\n\`\`\``,
  ]

  return {
    prompt: sections.join("\n\n---\n\n"),
  }
}
