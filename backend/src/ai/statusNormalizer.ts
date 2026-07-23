const STATUS_SYNONYMS: Record<string, "planned" | "in_progress" | "shipped"> = {
  // planned
  future: "planned",
  upcoming: "planned",
  "future scope": "planned",
  "future phase": "planned",
  roadmap: "planned",
  later: "planned",
  "not yet": "planned",
  "coming soon": "planned",
  proposed: "planned",
  planned: "planned",
  // in_progress
  "in progress": "in_progress",
  "in-progress": "in_progress",
  "in scope": "in_progress",
  "in scope review": "in_progress",
  active: "in_progress",
  ongoing: "in_progress",
  current: "in_progress",
  "phase 1": "in_progress",
  beta: "in_progress",
  "rolling out": "in_progress",
  "in development": "in_progress",
  in_progress: "in_progress",
  // shipped
  shipped: "shipped",
  live: "shipped",
  released: "shipped",
  ga: "shipped",
  done: "shipped",
  complete: "shipped",
  deployed: "shipped",
  available: "shipped",
  launched: "shipped",
}

/**
 * Deterministically normalizes each feature's `status` value to exactly one
 * of the schema's 4 valid values (or null). Applied AFTER JSON.parse and
 * BEFORE Zod validation, in the extraction post-parse step — the Zod enum
 * itself stays untouched (never weakened); this normalizes INTO it.
 *
 * Necessary because smaller models use synonyms the exact-match enum
 * otherwise rejects outright (observed live: qwen2.5:14b writing "future"
 * instead of "planned"), which drops the whole feature from the Builder's
 * output — same category of failure as a genuinely missing status, but
 * caused by wording, not by the source lacking evidence.
 *
 * Duck-types defensively since the input is pre-validation `unknown` — a
 * malformed shape just passes through untouched and is caught by Zod
 * exactly as it would have been before this function existed.
 */
export function normalizeFeatureStatuses(parsed: unknown): unknown {
  if (typeof parsed !== "object" || parsed === null) return parsed
  const obj = parsed as Record<string, unknown>
  if (!Array.isArray(obj.features)) return parsed

  const features = obj.features.map((feature) => {
    if (typeof feature !== "object" || feature === null) return feature
    const f = feature as Record<string, unknown>
    if (!("status" in f) || f.status === null || typeof f.status !== "string") return feature

    const original = f.status
    const title = typeof f.title === "string" ? f.title : "(untitled)"
    const key = original.trim().toLowerCase()

    if (key === "planned" || key === "in_progress" || key === "shipped") {
      if (key !== original) {
        console.log(`[statusNormalizer] normalized whitespace/case: "${original}" -> "${key}" for feature "${title}"`)
      }
      return { ...f, status: key }
    }

    const mapped = STATUS_SYNONYMS[key]
    if (mapped) {
      console.log(`[statusNormalizer] remapped "${original}" -> "${mapped}" for feature "${title}"`)
      return { ...f, status: mapped }
    }

    // Unrecognized or empty — null, never guess.
    console.log(`[statusNormalizer] unrecognized status "${original}" -> null for feature "${title}"`)
    return { ...f, status: null }
  })

  return { ...obj, features }
}
