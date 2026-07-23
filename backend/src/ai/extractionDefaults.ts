/**
 * Fills in schema-required top-level and per-feature keys that a model
 * sometimes omits entirely from its JSON, defaulting each to the schema's
 * own empty value for that field (null/[]/{}) — never inventing content,
 * only supplying the value the field would have taken had the model
 * written it explicitly. Applied AFTER JSON.parse and BEFORE Zod
 * validation — same stage and rationale as normalizeFeatureStatuses.
 *
 * FeatureExtractionSchema and FeatureSchema (see featureExtraction.schema.ts)
 * are both `.strict()` objects: a genuinely-empty field that's *missing* as
 * a key crashes validation exactly as hard as a wrong value would — same
 * failure class as the status-synonym problem, just at "key exists" rather
 * than "value is correct." The Zod schema itself is never touched; this
 * fills the data to satisfy it.
 *
 * Deliberately does NOT touch `title` — `z.string().min(1)` has no
 * non-invented empty default, so a feature missing a title is a deeper
 * structural problem this shouldn't paper over; it's left to fail
 * validation honestly instead.
 */

const TOP_LEVEL_STRING_OR_NULL_DEFAULTS = ["documentTitle", "releaseName", "problemStatement", "whyBuilt"]
const TOP_LEVEL_ARRAY_DEFAULTS = ["releasePlan", "features", "uiChanges", "enhancements", "bugFixes", "knownLimitations"]

const FEATURE_STRING_OR_NULL_DEFAULTS = [
  "description",
  "businessBenefit",
  "userImpact",
  "configuration",
  "limitations",
  "rolloutNotes",
  "parentTitle",
]
const FEATURE_ARRAY_DEFAULTS = ["navigationPath", "steps"]

function logDefaulted(scope: string, key: string, defaultValue: unknown): void {
  console.log(`[extractionDefaults] "${key}" missing in ${scope} — defaulted to ${JSON.stringify(defaultValue)}`)
}

export function fillMissingExtractionDefaults(parsed: unknown): unknown {
  if (typeof parsed !== "object" || parsed === null) return parsed
  const obj: Record<string, unknown> = { ...(parsed as Record<string, unknown>) }

  for (const key of TOP_LEVEL_STRING_OR_NULL_DEFAULTS) {
    if (!(key in obj)) {
      logDefaulted("top-level", key, null)
      obj[key] = null
    }
  }
  for (const key of TOP_LEVEL_ARRAY_DEFAULTS) {
    if (!(key in obj)) {
      logDefaulted("top-level", key, [])
      obj[key] = []
    }
  }

  if (!Array.isArray(obj.features)) return obj

  obj.features = obj.features.map((feature, index) => {
    if (typeof feature !== "object" || feature === null) return feature
    const f: Record<string, unknown> = { ...(feature as Record<string, unknown>) }
    const title = typeof f.title === "string" ? f.title : `feature[${index}]`

    for (const key of FEATURE_STRING_OR_NULL_DEFAULTS) {
      if (!(key in f)) {
        logDefaulted(`feature "${title}"`, key, null)
        f[key] = null
      }
    }
    for (const key of FEATURE_ARRAY_DEFAULTS) {
      if (!(key in f)) {
        logDefaulted(`feature "${title}"`, key, [])
        f[key] = []
      }
    }
    if (!("status" in f)) {
      logDefaulted(`feature "${title}"`, "status", null)
      f.status = null
    }

    if (typeof f.source !== "object" || f.source === null) {
      if (!("source" in f)) logDefaulted(`feature "${title}"`, "source", { page: null, excerpt: null })
      f.source = { page: null, excerpt: null }
    } else {
      const source: Record<string, unknown> = { ...(f.source as Record<string, unknown>) }
      if (!("page" in source)) source.page = null
      if (!("excerpt" in source)) {
        logDefaulted(`feature "${title}".source`, "excerpt", null)
        source.excerpt = null
      }
      f.source = source
    }

    return f
  })

  return obj
}
