import type { ExtractedFeature } from "../schemas/featureExtraction.schema"
import type {
  DistinctFeatureSuspicion,
  FeatureSourceTag,
  MergeCollisionLogEntry,
  MergeResult,
  TaggedFeature,
} from "./types"

/** Dedupe key: lowercase, collapse internal whitespace, strip trailing punctuation. */
export function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[.,;:!?]+$/, "")
}

/** Future Scope sorts after every main chunk — it represents the section that sits at the end of the document. */
function sourceOrderIndex(source: FeatureSourceTag, totalChunks: number): number {
  return source.kind === "chunk" ? source.chunkIndex : totalChunks
}

interface Group {
  key: string
  members: { tagged: TaggedFeature; arrivalIndex: number }[]
}

function isNonEmptyArray(value: string[]): boolean {
  return value.length > 0
}

/** Word-overlap heuristic: are these two descriptions plausibly the SAME feature, or genuinely distinct? */
function descriptionsSubstantivelyDiffer(a: string, b: string): boolean {
  const wordsA = new Set(a.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 2))
  const wordsB = new Set(b.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 2))
  if (wordsA.size === 0 || wordsB.size === 0) return false

  let shared = 0
  for (const w of wordsA) if (wordsB.has(w)) shared++
  const overlapRatio = shared / Math.min(wordsA.size, wordsB.size)
  return overlapRatio < 0.3
}

/**
 * Resolves a single field across colliding main-chunk records. Rule
 * attribution reflects WHAT actually decided the winner, not just
 * "wasn't a simple non-null-beats-null case":
 *  - Only one candidate is non-empty -> RULE_2 (non-null/non-empty beats
 *    null/empty).
 *  - All non-empty candidates are identical -> RULE_2 (not a real
 *    conflict; no log entry at all, since there's nothing to audit).
 *  - Multiple non-empty, genuinely differing candidates, and this field
 *    has a "longest wins" rule (description) that a strict length
 *    comparison can resolve -> still RULE_2 (longest-wins is itself a
 *    field-level rule, not an arbitrary tiebreak).
 *  - Multiple non-empty, genuinely differing candidates that "longest
 *    wins" can't resolve (exact length tie) or that have no length-based
 *    rule at all (navigationPath, steps, everything else) -> RULE_3,
 *    earlier chunk index wins, the tiebreak of last resort.
 */
function resolveField<T>(
  key: string,
  field: string,
  candidates: { value: T; chunkIndex: number }[],
  isEmpty: (value: T) => boolean,
  preferLonger: boolean,
  log: MergeCollisionLogEntry[],
): T {
  if (candidates.length === 1) return candidates[0].value

  const nonEmpty = candidates.filter((c) => !isEmpty(c.value))
  const earliestOf = (pool: typeof candidates) => pool.reduce((a, b) => (b.chunkIndex < a.chunkIndex ? b : a))
  const distinct = (pool: typeof candidates) => new Set(pool.map((c) => JSON.stringify(c.value))).size

  let winner: (typeof candidates)[number]
  let rule: MergeCollisionLogEntry["rule"] | null

  if (nonEmpty.length === 0) {
    winner = earliestOf(candidates)
    rule = distinct(candidates) > 1 ? "RULE_3_TIEBREAK" : null
  } else if (nonEmpty.length === 1) {
    winner = nonEmpty[0]
    rule = candidates.length > 1 ? "RULE_2_FIELD_LEVEL" : null
  } else if (distinct(nonEmpty) === 1) {
    winner = nonEmpty[0]
    rule = null
  } else if (preferLonger) {
    const maxLen = Math.max(...nonEmpty.map((c) => String(c.value).length))
    const longest = nonEmpty.filter((c) => String(c.value).length === maxLen)
    if (longest.length === 1) {
      winner = longest[0]
      rule = "RULE_2_FIELD_LEVEL"
    } else {
      winner = earliestOf(longest)
      rule = "RULE_3_TIEBREAK"
    }
  } else {
    winner = earliestOf(nonEmpty)
    rule = "RULE_3_TIEBREAK"
  }

  if (rule !== null) {
    log.push({
      key,
      field,
      winningValue: winner.value,
      losingValues: candidates.filter((c) => c !== winner).map((c) => c.value),
      rule,
      winningSource: `chunk_${winner.chunkIndex}`,
    })
  }

  return winner.value
}

/**
 * Merges tagged features from all main chunks and the Future Scope second
 * pass into one deterministic, ordered array. Running this twice on
 * identical input produces byte-for-byte identical output — no
 * "richest record wins" heuristics, no Date.now(), no unstable ordering.
 */
export function mergeExtractedFeatures(taggedFeatures: TaggedFeature[], totalChunks: number): MergeResult {
  const groups = new Map<string, Group>()
  const keyOrder: string[] = []

  taggedFeatures.forEach((tagged, arrivalIndex) => {
    const key = normalizeTitle(tagged.feature.title)
    let group = groups.get(key)
    if (!group) {
      group = { key, members: [] }
      groups.set(key, group)
      keyOrder.push(key)
    }
    group.members.push({ tagged, arrivalIndex })
  })

  const collisionLog: MergeCollisionLogEntry[] = []
  const distinctFeatureSuspicions: DistinctFeatureSuspicion[] = []

  // Preserve first-occurrence order: whichever source's occurrence of this
  // key came first (by chunk index, Future Scope sorting after all main
  // chunks) determines the group's position in the final output.
  const orderedKeys = [...keyOrder].sort((a, b) => {
    const groupA = groups.get(a)!
    const groupB = groups.get(b)!
    const firstA = Math.min(...groupA.members.map((m) => sourceOrderIndex(m.tagged.source, totalChunks)))
    const firstB = Math.min(...groupB.members.map((m) => sourceOrderIndex(m.tagged.source, totalChunks)))
    if (firstA !== firstB) return firstA - firstB
    const arrivalA = Math.min(...groupA.members.map((m) => m.arrivalIndex))
    const arrivalB = Math.min(...groupB.members.map((m) => m.arrivalIndex))
    return arrivalA - arrivalB
  })

  const mergedFeatures: ExtractedFeature[] = []

  for (const key of orderedKeys) {
    const group = groups.get(key)!
    const futureScopeMembers = group.members.filter((m) => m.tagged.source.kind === "future_scope")
    const chunkMembers = group.members.filter((m) => m.tagged.source.kind === "chunk")

    // Distinct-feature suspicion check: flag, never silently merge past it.
    const allDescriptions = group.members.map((m) => m.tagged.feature.description)
    const nonNullDescriptions = allDescriptions.filter((d): d is string => d !== null)
    if (group.members.length > 1 && nonNullDescriptions.length >= 2) {
      const [first, ...rest] = nonNullDescriptions
      if (rest.some((d) => descriptionsSubstantivelyDiffer(first, d))) {
        distinctFeatureSuspicions.push({
          key,
          titles: group.members.map((m) => m.tagged.feature.title),
          descriptions: allDescriptions,
        })
      }
    }

    // RULE 1 — source precedence: a Future Scope record beats ALL
    // main-chunk records for the same key, entirely — no field merging.
    if (futureScopeMembers.length > 0) {
      const winner = futureScopeMembers[0].tagged.feature
      if (chunkMembers.length > 0) {
        collisionLog.push({
          key,
          field: "(entire record)",
          winningValue: winner,
          losingValues: chunkMembers.map((m) => m.tagged.feature),
          rule: "RULE_1_SOURCE_PRECEDENCE",
          winningSource: "future_scope",
        })
      }
      mergedFeatures.push(winner)
      continue
    }

    // Only one record for this key — no collision, nothing to resolve.
    if (chunkMembers.length === 1) {
      mergedFeatures.push(chunkMembers[0].tagged.feature)
      continue
    }

    // RULE 2 + RULE 3 — field-level merge across colliding main-chunk records.
    const candidates = chunkMembers.map((m) => ({
      feature: m.tagged.feature,
      chunkIndex: m.tagged.source.kind === "chunk" ? m.tagged.source.chunkIndex : 0,
    }))

    const title = resolveField(
      key,
      "title",
      candidates.map((c) => ({ value: c.feature.title, chunkIndex: c.chunkIndex })),
      () => false,
      false,
      collisionLog,
    )

    const status = resolveField(
      key,
      "status",
      candidates.map((c) => ({ value: c.feature.status, chunkIndex: c.chunkIndex })),
      (v) => v === null,
      false,
      collisionLog,
    )

    const description = resolveField(
      key,
      "description",
      candidates.map((c) => ({ value: c.feature.description, chunkIndex: c.chunkIndex })),
      (v) => v === null,
      true,
      collisionLog,
    )

    const businessBenefit = resolveField(
      key,
      "businessBenefit",
      candidates.map((c) => ({ value: c.feature.businessBenefit, chunkIndex: c.chunkIndex })),
      (v) => v === null,
      false,
      collisionLog,
    )

    const userImpact = resolveField(
      key,
      "userImpact",
      candidates.map((c) => ({ value: c.feature.userImpact, chunkIndex: c.chunkIndex })),
      (v) => v === null,
      false,
      collisionLog,
    )

    const configuration = resolveField(
      key,
      "configuration",
      candidates.map((c) => ({ value: c.feature.configuration, chunkIndex: c.chunkIndex })),
      (v) => v === null,
      false,
      collisionLog,
    )

    const navigationPath = resolveField(
      key,
      "navigationPath",
      candidates.map((c) => ({ value: c.feature.navigationPath, chunkIndex: c.chunkIndex })),
      (v) => !isNonEmptyArray(v),
      false,
      collisionLog,
    )

    const steps = resolveField(
      key,
      "steps",
      candidates.map((c) => ({ value: c.feature.steps, chunkIndex: c.chunkIndex })),
      (v) => !isNonEmptyArray(v),
      false,
      collisionLog,
    )

    const limitations = resolveField(
      key,
      "limitations",
      candidates.map((c) => ({ value: c.feature.limitations, chunkIndex: c.chunkIndex })),
      (v) => v === null,
      false,
      collisionLog,
    )

    const rolloutNotes = resolveField(
      key,
      "rolloutNotes",
      candidates.map((c) => ({ value: c.feature.rolloutNotes, chunkIndex: c.chunkIndex })),
      (v) => v === null,
      false,
      collisionLog,
    )

    const parentTitle = resolveField(
      key,
      "parentTitle",
      candidates.map((c) => ({ value: c.feature.parentTitle, chunkIndex: c.chunkIndex })),
      (v) => v === null,
      false,
      collisionLog,
    )

    mergedFeatures.push({
      title,
      status,
      description,
      businessBenefit,
      userImpact,
      configuration,
      navigationPath,
      steps,
      limitations,
      rolloutNotes,
      parentTitle,
      source: { page: null, excerpt: null },
    })
  }

  return { features: mergedFeatures, collisionLog, distinctFeatureSuspicions }
}
