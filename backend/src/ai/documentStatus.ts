export type DocumentStatus = "planned" | "in_progress" | "shipped" | null

interface StatusPattern {
  status: Exclude<DocumentStatus, null>
  pattern: RegExp
}

/**
 * Checked in order; first match wins. "in_progress" is checked first —
 * current-work evidence (an active phase statement, a Jira ticket still in
 * progress) is the most direct signal of a document's own rollout stage;
 * it shouldn't be overridden by a "shipped"-looking reference found
 * elsewhere in the same document (e.g. a ticket tagged LIVE that refers to
 * something else). Word-boundaried and case-insensitive throughout —
 * unboundaried matching on a short token like "GA" would false-positive
 * inside ordinary words (e.g. "manage", "storage").
 */
const STATUS_PATTERNS: StatusPattern[] = [
  { status: "in_progress", pattern: /\bin progress\b/i },
  { status: "in_progress", pattern: /\bin scope review\b/i },
  { status: "in_progress", pattern: /\bphase 1\b/i },
  { status: "shipped", pattern: /\breleased\b/i },
  { status: "shipped", pattern: /\blive\b/i },
  { status: "shipped", pattern: /\bgeneral availability\b/i },
  { status: "shipped", pattern: /\bga\b/i },
  { status: "planned", pattern: /\bcoming soon\b/i },
  { status: "planned", pattern: /\bplanned\b/i },
  { status: "planned", pattern: /\broadmap\b/i },
  { status: "planned", pattern: /\bfuture scope\b/i },
]

/**
 * Deterministic, code-side document-level rollout status detection —
 * replaces asking the model to infer this. Scans the cleaned document text
 * for known rollout indicators (Jira tags, phase language, release
 * wording) anywhere in the document and returns the first matching
 * category in the fixed precedence order above. Returns null when no
 * indicator is found anywhere — never guesses.
 */
export function detectDocumentStatus(text: string): DocumentStatus {
  for (const { status, pattern } of STATUS_PATTERNS) {
    if (pattern.test(text)) return status
  }
  return null
}
