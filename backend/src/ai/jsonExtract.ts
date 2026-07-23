/**
 * Best-effort extraction of a single JSON object's text from a raw model
 * response. Strips a leading/trailing ```json fence if present, then
 * narrows to the substring from the first "{" to the last "}" — tolerates
 * stray prose a model wraps around the JSON (e.g. a local model that isn't
 * as reliably constrained by response_format as Groq's hosted models are).
 *
 * Purely additive tolerance: for an already-clean `{...}` response with no
 * fences or surrounding text (the normal case, on any provider, with
 * response_format: json_object), the first-"{"-to-last-"}" slice is the
 * entire trimmed string — identical to just calling JSON.parse directly.
 */
export function extractJsonObjectText(rawText: string): string {
  const stripped = rawText
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```\s*$/i, "")
    .trim()

  const start = stripped.indexOf("{")
  const end = stripped.lastIndexOf("}")
  if (start === -1 || end === -1 || end < start) return stripped

  return stripped.slice(start, end + 1)
}
