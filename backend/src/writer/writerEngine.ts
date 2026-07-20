import type { NewsletterBuilderOutput, NewsletterFeatureItem } from "../newsletter/types"
import { buildWriterPrompt, PROMPT_VERSION } from "./promptBuilder"
import type { WriterEngineOutput } from "./types"

/**
 * Strips internal document-structure labels off the front of a title —
 * "Use Case 5 — Request Expiry" becomes "Request Expiry". These leak
 * straight into customer-facing copy otherwise; the model must never be
 * the one deciding this, so it's stripped deterministically before the
 * Writer ever sees the JSON.
 */
const INTERNAL_LABEL_PREFIX = /^(Use Case|Flow|Section)\s*\d+\s*[—–-]\s*/i

export function normalizeTitle(title: string): string {
  return title.replace(INTERNAL_LABEL_PREFIX, "").trim()
}

function normalizeItem(item: NewsletterFeatureItem): NewsletterFeatureItem {
  const normalized = normalizeTitle(item.title)
  if (normalized !== item.title) {
    console.log(`[writerEngine] title normalized: "${item.title}" -> "${normalized}"`)
  }
  return { ...item, title: normalized || item.title }
}

/**
 * Applies title normalization to every feature item in the Builder
 * output. Builder's own classification logic is untouched — this only
 * rewrites the `title` field on the items it already produced.
 */
function normalizeBuilderOutputTitles(builderOutput: NewsletterBuilderOutput): NewsletterBuilderOutput {
  return {
    ...builderOutput,
    whatsNew: builderOutput.whatsNew.map(normalizeItem),
    comingSoon: builderOutput.comingSoon.map(normalizeItem),
    unclassified: builderOutput.unclassified.map(normalizeItem),
  }
}

/**
 * FIX (parent/child dedupe): hard filter, not a soft prompt instruction —
 * the "never split one feature across two items / merge sub-headings"
 * instruction failed twice as a soft rule (observed live: "Tracked Events"
 * stayed a separate item from its parent "Shift Timeline & Audit Log"
 * despite the instruction). Same principle as title normalization and the
 * null-description filter: a filter belongs in code. If a feature's
 * parentTitle matches another feature's title in the SAME selection set
 * (whatsNew or comingSoon, checked independently), the child is dropped
 * before the model ever sees it — it was already going to be described,
 * directly or by implication, under its parent.
 *
 * Runs BEFORE title normalization deliberately: parentTitle references the
 * feature's ORIGINAL extracted title (e.g. "Use Case 3 — Business View..."),
 * which normalization would otherwise strip from the parent's own `title`
 * field first, breaking the match.
 */
function dedupeParentChildItems(items: NewsletterFeatureItem[]): NewsletterFeatureItem[] {
  const titles = new Set(items.map((item) => item.title))
  const kept: NewsletterFeatureItem[] = []
  const dropped: string[] = []

  for (const item of items) {
    if (item.parentTitle !== null && titles.has(item.parentTitle)) {
      dropped.push(item.title)
      continue
    }
    kept.push(item)
  }

  if (dropped.length > 0) {
    console.log(
      `[writerEngine] dropped ${dropped.length} child item(s) whose parent is also present in this selection: ${dropped.join(", ")}`,
    )
  }

  return kept
}

/** Must match builder.ts's own NO_DESCRIPTION_FALLBACK exactly — duplicated here rather than exported, since builder.ts stays untouched. */
const NO_DESCRIPTION_MARKER = "Details to be announced."

const MIN_COMING_SOON_ITEMS = 2

/**
 * FIX 1: hard filter, not a soft prompt preference — the "prefer described
 * items" instruction failed nondeterministically (RUN A selected 3/3
 * correctly, RUN B selected 3/4, padding with a null-description item).
 * Same principle as title normalization: a filter belongs in code. If at
 * least 2 items have a real description, the model never even sees the
 * null-description ones, so it cannot select one. Below that floor,
 * described items are topped up with nulls so Coming Soon isn't empty.
 */
function filterComingSoonByDescription(items: NewsletterFeatureItem[]): NewsletterFeatureItem[] {
  const described = items.filter((item) => item.description !== NO_DESCRIPTION_MARKER)
  const undescribed = items.filter((item) => item.description === NO_DESCRIPTION_MARKER)

  if (described.length >= MIN_COMING_SOON_ITEMS) {
    if (undescribed.length > 0) {
      console.log(
        `[writerEngine] filtered ${undescribed.length} null-description item(s) from Coming Soon: ${undescribed.map((i) => i.title).join(", ")}`,
      )
    }
    return described
  }

  const fillCount = MIN_COMING_SOON_ITEMS - described.length
  const filled = undescribed.slice(0, fillCount)
  const dropped = undescribed.slice(fillCount)
  if (dropped.length > 0) {
    console.log(
      `[writerEngine] filtered ${dropped.length} null-description item(s) from Coming Soon (floor of ${MIN_COMING_SOON_ITEMS} reached): ${dropped.map((i) => i.title).join(", ")}`,
    )
  }
  return [...described, ...filled]
}

/**
 * Coordinates the Writer Engine: drops parent/child duplicate items,
 * normalizes titles, hard-filters Coming Soon's null-description items,
 * then assembles the slot-filling prompt (see promptBuilder.ts) — no style
 * guide, no example newsletters. This function makes no AI calls and
 * writes no newsletter prose — it only prepares context for a future
 * Writer AI call.
 */
export function prepareWriterPrompt(builderOutput: NewsletterBuilderOutput): WriterEngineOutput {
  const deduped: NewsletterBuilderOutput = {
    ...builderOutput,
    whatsNew: dedupeParentChildItems(builderOutput.whatsNew),
    comingSoon: dedupeParentChildItems(builderOutput.comingSoon),
  }
  const normalized = normalizeBuilderOutputTitles(deduped)
  const filtered: NewsletterBuilderOutput =
    normalized.newsletterType === "coming_soon"
      ? { ...normalized, comingSoon: filterComingSoonByDescription(normalized.comingSoon) }
      : normalized
  const { prompt } = buildWriterPrompt({ builderOutput: filtered })

  // Exactly the items embedded in the prompt above (post-dedupe,
  // post-normalization, post-description-filter) — the true ground truth
  // for the Verifier (see verifier/newsletterVerifier.ts), not a
  // re-derived approximation that could drift from this function's own
  // filtering logic.
  const sourceItems = filtered.newsletterType === "coming_soon" ? filtered.comingSoon : filtered.whatsNew

  return {
    prompt,
    newsletterType: builderOutput.newsletterType,
    metadata: {
      builderVersion: builderOutput.metadata.builderVersion,
      promptVersion: PROMPT_VERSION,
      newsletterType: builderOutput.newsletterType,
    },
    sourceItems,
  }
}
