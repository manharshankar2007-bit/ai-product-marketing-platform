import type { ExtractedFeature } from "../schemas/featureExtraction.schema"

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

export interface ExtractionRouteBase {
  promptTokens: number
  documentTokens: number
  maxOutputTokens: number
  estimatedTotalTokens: number
  tpmLimit: number
  safetyMarginTokens: number
  budgetTokens: number
}

export interface SinglePassRoute extends ExtractionRouteBase {
  path: "single_pass"
}

export interface ChunkedRoute extends ExtractionRouteBase {
  path: "chunked"
  overBy: number
}

export type ExtractionRoute = SinglePassRoute | ChunkedRoute

// ---------------------------------------------------------------------------
// Chunker
// ---------------------------------------------------------------------------

export interface DocumentSection {
  /** Heading label, or a fixed marker for the document's leading (pre-heading) text. */
  heading: string
  text: string
  charCount: number
  tokenCount: number
}

export interface DocumentChunk {
  index: number
  /** Heading labels of every section folded into this chunk, in order. */
  sections: string[]
  /** The raw section content alone — no header — for the lossless coverage assertion (see chunker.ts's checkLosslessCoverage). */
  bodyText: string
  /** Final text actually sent to the model for this chunk: header + body. */
  text: string
  charCount: number
  /**
   * Every term of the per-call arithmetic reported separately — content
   * + header + system prompt + output reserve <= 12,000 - margin — so no
   * chunk relies on an unstated reserve to fit. `contentTokens` is the
   * raw section body alone; `headerTokens` is the context header alone
   * (title + section path + verbatim phase-framing statement +
   * boilerplate); `promptTokens`/`outputReserveTokens` are repeated per
   * chunk for clarity even though they're constant across all chunks.
   */
  contentTokens: number
  headerTokens: number
  promptTokens: number
  outputReserveTokens: number
  /** contentTokens + headerTokens + promptTokens + outputReserveTokens. */
  estimatedTotalCallTokens: number
}

export interface ChunkPlan {
  documentTitle: string | null
  /**
   * Located verbatim from the source, carried into every chunk's header
   * unchanged, when present. Absence is a normal, valid case — most PRDs
   * don't use this exact "Scope for This Phase" phrasing — so this is
   * `null` rather than required. Never synthesized when absent; status
   * detection falls back to per-section/per-feature evidence in that
   * case (see extractor.md's own status rules, which already support this).
   */
  phaseFramingStatement: string | null
  phaseFramingTokens: number
  chunks: DocumentChunk[]
  /** True when the Future Scope section was found and excluded from all chunks. */
  futureScopeExcluded: boolean
  futureScopeCharCount: number
  futureScopeTokens: number
  promptTokens: number
  /** The CHUNKED-path output reserve (separate from the global GROQ_MAX_OUTPUT_TOKENS used by the single-pass path). */
  outputReserveTokens: number
  /**
   * The CONTENT-only ceiling used while packing sections into chunks —
   * i.e. budgetTokens - promptTokens - outputReserveTokens - headerReserveTokens.
   * Compared against each section's own token count (no header), never
   * against a chunk's final total-call tokens (see DocumentChunk).
   */
  contentBudgetPerChunkTokens: number
}

/** Thrown when the document-level phase-framing statement cannot be reliably located — never synthesize a substitute. */
export class PhaseFramingNotFoundError extends Error {
  constructor() {
    super(
      "Could not reliably locate the document-level phase-framing statement " +
        '(e.g. "Scope for This Phase"). Refusing to synthesize a substitute — ' +
        "chunking cannot proceed without it.",
    )
    this.name = "PhaseFramingNotFoundError"
  }
}

/**
 * Result of the hard, character-level lossless-coverage assertion:
 * concat(all chunk bodyText, in order) must equal (source minus the
 * Future Scope carve-out), ignoring only whitespace-run differences
 * (never content differences). Not an approximation — either
 * `isLossless` is true, or exact offsets/context are reported so the
 * discrepancy can be located, not guessed at.
 */
export interface LosslessCoverageResult {
  isLossless: boolean
  expectedNormalizedLength: number
  actualNormalizedLength: number
  firstDivergenceOffset: number | null
  contextBefore: string | null
  missingOrDifferentExpected: string | null
  missingOrDifferentActual: string | null
}

/** Thrown when a single section alone exceeds the per-chunk budget — never silently hard-split. */
export class ChunkTooLargeError extends Error {
  readonly heading: string
  readonly tokenCount: number
  readonly budgetTokens: number

  constructor(heading: string, tokenCount: number, budgetTokens: number) {
    super(
      `Section "${heading}" alone is ${tokenCount} tokens, which exceeds the ` +
        `per-chunk budget of ${budgetTokens} tokens. Refusing to silently hard-split it.`,
    )
    this.name = "ChunkTooLargeError"
    this.heading = heading
    this.tokenCount = tokenCount
    this.budgetTokens = budgetTokens
  }
}

// ---------------------------------------------------------------------------
// Rate limiter
// ---------------------------------------------------------------------------

export interface CallEstimate {
  index: number
  label: string
  estimatedTokens: number
}

export interface ScheduledCall extends CallEstimate {
  scheduledAtMs: number
}

// ---------------------------------------------------------------------------
// Merger
// ---------------------------------------------------------------------------

export type FeatureSourceTag = { kind: "chunk"; chunkIndex: number } | { kind: "future_scope" }

export interface TaggedFeature {
  source: FeatureSourceTag
  feature: ExtractedFeature
}

export type MergeRule = "RULE_1_SOURCE_PRECEDENCE" | "RULE_2_FIELD_LEVEL" | "RULE_3_TIEBREAK"

export interface MergeCollisionLogEntry {
  key: string
  field: string
  winningValue: unknown
  losingValues: unknown[]
  rule: MergeRule
  winningSource: string
}

export interface DistinctFeatureSuspicion {
  key: string
  titles: string[]
  descriptions: (string | null)[]
}

export interface MergeResult {
  features: ExtractedFeature[]
  collisionLog: MergeCollisionLogEntry[]
  distinctFeatureSuspicions: DistinctFeatureSuspicion[]
}
