import { countTokens } from "./tokenizer"
import { SAFETY_MARGIN_TOKENS, TPM_LIMIT } from "./router"
import { ChunkTooLargeError, type ChunkPlan, type DocumentChunk, type DocumentSection, type LosslessCoverageResult } from "./types"

// Mirrors the heading pattern in ../futureScopePass.ts
// (isolateFutureScopeSection). Deliberately NOT imported from there —
// futureScopePass.ts is explicitly off-limits to modify in this task, and
// importing would still couple this module to it; kept as a manually
// synced literal copy instead. If that pattern changes, update this one.
const FUTURE_SECTION_HEADING_PATTERN =
  /^(future scope|coming soon|roadmap|upcoming(?:\s+features)?|planned features)\b.*$/im

/**
 * Section boundary pattern for this document family: a line starting with
 * "Use Case N", "Flow N", or "Section N" (colon, em-dash, or en-dash
 * separator all attested in real documents seen so far). "Flow N" and
 * "Section N" are genuine authored sub-headings nested one level below
 * "Use Case N" (e.g. "Use Case 2" contains "Flow 1" through "Flow 5") —
 * recognizing them was required after the first offline dry run against
 * the real target document threw ChunkTooLargeError on "Use Case 2"
 * alone. Splitting at "Flow N" is still a genuine, human-authored section
 * boundary — not an arbitrary mid-feature cut — so this stays within
 * "semantic/heading boundaries," it's just one level finer-grained.
 *
 * Deliberately conservative/narrow rather than a broad "any
 * heading-looking line" heuristic — a false negative here just means a
 * slightly larger chunk (safe, may still throw ChunkTooLargeError, which
 * is reportable); a false positive would split mid-feature (unsafe, and
 * explicitly forbidden). Extending this pattern for other document
 * families/conventions is future work, not attempted here.
 */
const USE_CASE_HEADING_PATTERN = /^(use case|flow|section)\s+\d+/im

/**
 * Marks the start of the document-level phase-framing statement (Bug 1).
 * Narrow and specific by design, same rationale as the patterns above.
 */
const PHASE_FRAMING_START_PATTERN = /^scope for this phase\b.*$/im

/**
 * Real, observed headings that can immediately follow the phase-framing
 * statement in this document family's introduction — used only to find
 * where that statement ENDS. Includes the section-boundary and
 * Future-Scope patterns too, since either could in principle follow.
 * Deliberately a specific list, not a generic "next heading" heuristic —
 * consistent with the narrow/conservative approach used everywhere else
 * in this module.
 */
const INTRO_HEADING_STOP_PATTERNS: RegExp[] = [
  USE_CASE_HEADING_PATTERN,
  FUTURE_SECTION_HEADING_PATTERN,
  /^long-term vision\b.*$/im,
  /^market research\b.*$/im,
  /^user persona\b.*$/im,
  /^assumptions\b.*$/im,
  /^product philosophy\b.*$/im,
]

/**
 * Chunked-path-only output reserve — see planChunks doc comment. Global
 * GROQ_MAX_OUTPUT_TOKENS is untouched.
 *
 * Raised from the original 1,200 to 2,000 after two separate live
 * observations: a Step 2 smoke-test chunk used 1,128/1,200 (94%) for 9
 * features, and a live chunk on a real 10-page document actually hit
 * finish_reason: "length" and was correctly refused rather than merged
 * truncated.
 *
 * A live chunk on "Use Case 4 — Supplier View" (2,150 content tokens, no
 * further heading-level sub-split available) then hit finish_reason:
 * "length" at 2,000 and was correctly refused. Deliberately NOT raised
 * further: doing so shrinks the content budget (same TPM_LIMIT pool),
 * which increases chunk count and total run cost against the 100K TPD
 * cap — testing capacity is the scarcer resource, and the achievable
 * raise (~2,130, the ceiling before Use Case 4 becomes un-chunkable) was
 * still unverified as sufficient and only bought a 10-token margin. Use
 * Case 4 truncating at 2,000 is accepted as a known limitation instead —
 * the finish_reason: "length" guard in chunkedExtraction.ts catches it
 * loudly and refuses to merge a truncated extraction, so the failure
 * mode is safe, just not yet fixed. Revisit only via either a genuine
 * further reduction in extractor.md's size or a finer heading-boundary
 * split of Use Case 4 (chunker.ts pattern change, not a constant tweak).
 */
export const CHUNKED_PATH_MAX_OUTPUT_TOKENS = 2_000

/** Small, roughly-constant reserve for the header's boilerplate lines (title, chunk-count, section list, instruction) — NOT the phase-framing text, which is measured exactly. */
const HEADER_BOILERPLATE_RESERVE_TOKENS = 100

const LEADING_SECTION_LABEL = "(document introduction)"

function findHeadingLineIndices(text: string): number[] {
  const indices: number[] = []
  const pattern = new RegExp(USE_CASE_HEADING_PATTERN.source, "img")
  let match: RegExpExecArray | null
  while ((match = pattern.exec(text)) !== null) {
    indices.push(match.index)
  }
  return indices
}

function headingLabelAt(text: string, index: number): string {
  const lineEnd = text.indexOf("\n", index)
  return (lineEnd === -1 ? text.slice(index) : text.slice(index, lineEnd)).trim()
}

/**
 * Splits the non-Future-Scope portion of the document into ordered
 * sections at "Use Case N" / "Flow N" / "Section N" boundaries. Text
 * before the first heading (if any) becomes its own leading section.
 */
function splitIntoSections(mainText: string): DocumentSection[] {
  const headingIndices = findHeadingLineIndices(mainText)

  const boundaries: { start: number; label: string }[] =
    headingIndices.length === 0 || headingIndices[0] > 0
      ? [{ start: 0, label: LEADING_SECTION_LABEL }, ...headingIndices.map((i) => ({ start: i, label: headingLabelAt(mainText, i) }))]
      : headingIndices.map((i) => ({ start: i, label: headingLabelAt(mainText, i) }))

  return boundaries.map((boundary, i) => {
    const end = i + 1 < boundaries.length ? boundaries[i + 1].start : mainText.length
    const text = mainText.slice(boundary.start, end).trim()
    return {
      heading: boundary.label,
      text,
      charCount: text.length,
      tokenCount: countTokens(text),
    }
  })
}

/**
 * CHANGE 1: locates the document-level phase-framing statement (heading +
 * body, e.g. "Scope for This Phase" through to whatever heading follows
 * it) so it can be carried VERBATIM into every chunk's header. Returns
 * null if it cannot be reliably located — callers must throw
 * PhaseFramingNotFoundError, never synthesize a substitute.
 */
export function locatePhaseFramingStatement(mainText: string): string | null {
  const startMatch = PHASE_FRAMING_START_PATTERN.exec(mainText)
  if (!startMatch) return null

  const searchFrom = startMatch.index + startMatch[0].length
  const remainder = mainText.slice(searchFrom)

  let endOffset = remainder.length
  for (const pattern of INTRO_HEADING_STOP_PATTERNS) {
    const m = pattern.exec(remainder)
    if (m && m.index < endOffset) endOffset = m.index
  }

  const statement = mainText.slice(startMatch.index, searchFrom + endOffset).trim()
  return statement.length > 0 ? statement : null
}

/**
 * The phase-framing block is included only when a statement was actually
 * located in the source — never synthesized. Its absence is a normal,
 * valid case (most PRDs don't use this exact phrasing), not a degraded
 * one; the header is simply three lines shorter, and status detection
 * falls back to per-section/per-feature evidence (extractor.md already
 * supports this — that's the same fallback a single, unchunked document
 * with no such statement would use).
 */
function buildContextHeader(
  documentTitle: string | null,
  phaseFramingStatement: string | null,
  sectionLabels: string[],
  chunkIndex: number,
  totalChunks: number,
): string {
  const lines = [
    `[Document: ${documentTitle ?? "(untitled)"}]`,
    `[This is chunk ${chunkIndex + 1} of ${totalChunks} from a larger document.]`,
    `[This excerpt covers: ${sectionLabels.join("; ")}]`,
  ]
  if (phaseFramingStatement !== null) {
    lines.push(
      "[Document-level phase framing — applies to every feature below unless a more specific statement says otherwise:]",
      phaseFramingStatement,
    )
  }
  lines.push("[Extract only what is explicitly stated in THIS excerpt.]", "")
  return lines.join("\n")
}

function extractDocumentTitle(cleanText: string): string | null {
  const firstLine = cleanText.split("\n")[0]?.trim()
  return firstLine && firstLine.length > 0 ? firstLine : null
}

/**
 * Builds the chunk plan for a document that the router has already
 * decided needs chunking. Excludes the Future Scope section entirely (the
 * verified second pass owns it), splits the remainder at "Use Case N" /
 * "Flow N" / "Section N" boundaries, and greedily packs consecutive
 * sections into chunks up to the runtime content budget. Never splits a
 * single section across chunks; throws ChunkTooLargeError instead of
 * silently hard-splitting one that alone exceeds the budget.
 *
 * Document-level phase framing (Bug 1) is used when present, carried
 * verbatim into every chunk's header — but its absence is a normal, valid
 * case, not an error: most real PRDs don't use the exact "Scope for This
 * Phase" phrasing this pattern looks for (that phrasing was specific to
 * one document family). Proceeding without it was previously a hard
 * failure (PhaseFramingNotFoundError) that broke chunking for any other
 * document shape entirely — status detection still works without it via
 * extractor.md's own per-section/per-feature fallback rules, the same
 * ones a single-pass (unchunked) document with no such statement already
 * relies on. Never synthesized either way — "use it if present, omit if
 * absent," never "invent one."
 *
 * CHANGE 2: uses CHUNKED_PATH_MAX_OUTPUT_TOKENS (1,200), a separate
 * reserve from the global GROQ_MAX_OUTPUT_TOKENS (2,500, sized for a
 * whole-document single-pass extraction). Each chunk emits only 2-4
 * features — evidence: the single pass over the entire condensed
 * document used just 901 of its 2,500-token reserve for 13 features — so
 * 1,200 is still generous per chunk while freeing real per-chunk content
 * budget. The single-pass path's own budget math (router.ts) is
 * untouched.
 */
export function planChunks(
  cleanText: string,
  systemPrompt: string,
  chunkedOutputReserveTokens: number = CHUNKED_PATH_MAX_OUTPUT_TOKENS,
): ChunkPlan {
  const promptTokens = countTokens(systemPrompt)
  const budgetTokens = TPM_LIMIT - SAFETY_MARGIN_TOKENS

  const futureScopeMatch = FUTURE_SECTION_HEADING_PATTERN.exec(cleanText)
  const mainText = futureScopeMatch ? cleanText.slice(0, futureScopeMatch.index).trimEnd() : cleanText
  const futureScopeCharCount = futureScopeMatch ? cleanText.length - futureScopeMatch.index : 0
  const futureScopeTokens = futureScopeMatch ? countTokens(cleanText.slice(futureScopeMatch.index)) : 0

  const phaseFramingStatement = locatePhaseFramingStatement(mainText)
  if (phaseFramingStatement === null) {
    console.log(
      "[chunker] no document-level phase framing found — proceeding without it; status falls back to per-section evidence.",
    )
  }
  const phaseFramingTokens = phaseFramingStatement !== null ? countTokens(phaseFramingStatement) : 0

  // CHANGE 3: the content budget used for PACKING (compared against each
  // section's own token count, header excluded) is separate from a
  // chunk's final total-call tokens (content + header + prompt + output,
  // computed per chunk below and verified against `budgetTokens`). The
  // header reserve here accounts for the now-verbatim phase-framing text
  // (measured exactly) plus a small fixed reserve for the header's other,
  // roughly-constant boilerplate lines.
  const headerReserveTokens = phaseFramingTokens + HEADER_BOILERPLATE_RESERVE_TOKENS
  const contentBudgetPerChunkTokens = budgetTokens - promptTokens - chunkedOutputReserveTokens - headerReserveTokens

  const documentTitle = extractDocumentTitle(cleanText)
  const sections = splitIntoSections(mainText)

  for (const section of sections) {
    if (section.tokenCount > contentBudgetPerChunkTokens) {
      throw new ChunkTooLargeError(section.heading, section.tokenCount, contentBudgetPerChunkTokens)
    }
  }

  // Greedy bin-packing: accumulate consecutive sections into the current
  // chunk until the next one would exceed the CONTENT budget, then start
  // a new chunk. Never reorders sections — output stays in document order.
  const packedGroups: DocumentSection[][] = []
  let currentGroup: DocumentSection[] = []
  let currentGroupTokens = 0

  for (const section of sections) {
    if (currentGroup.length > 0 && currentGroupTokens + section.tokenCount > contentBudgetPerChunkTokens) {
      packedGroups.push(currentGroup)
      currentGroup = []
      currentGroupTokens = 0
    }
    currentGroup.push(section)
    currentGroupTokens += section.tokenCount
  }
  if (currentGroup.length > 0) packedGroups.push(currentGroup)

  const totalChunks = packedGroups.length
  const chunks: DocumentChunk[] = packedGroups.map((group, index) => {
    const sectionLabels = group.map((s) => s.heading)
    const header = buildContextHeader(documentTitle, phaseFramingStatement, sectionLabels, index, totalChunks)
    const body = group.map((s) => s.text).join("\n\n")
    const text = header + body

    // Every term of the per-call arithmetic, measured separately and
    // explicitly (CHANGE 3) — no term folded into another, nothing left
    // to unstated reserves.
    const headerTokens = countTokens(header)
    const contentTokens = countTokens(body)
    const estimatedTotalCallTokens = contentTokens + headerTokens + promptTokens + chunkedOutputReserveTokens

    return {
      index,
      sections: sectionLabels,
      bodyText: body,
      text,
      charCount: text.length,
      contentTokens,
      headerTokens,
      promptTokens,
      outputReserveTokens: chunkedOutputReserveTokens,
      estimatedTotalCallTokens,
    }
  })

  return {
    documentTitle,
    phaseFramingStatement,
    phaseFramingTokens,
    chunks,
    futureScopeExcluded: futureScopeMatch !== null,
    futureScopeCharCount,
    futureScopeTokens,
    promptTokens,
    outputReserveTokens: chunkedOutputReserveTokens,
    contentBudgetPerChunkTokens,
  }
}

/** Collapse all whitespace runs to a single space — the only difference this check ever ignores. */
function normalizeForCoverageCheck(text: string): string {
  return text.replace(/\s+/g, " ").trim()
}

/**
 * HARD GATE (Phase 2, Step 0): concat(all chunk bodyText, in order) must
 * be identical to (source minus the Future Scope carve-out), ignoring
 * only whitespace-run differences (never content). String equality on
 * the whitespace-normalized text — not an approximation, and never
 * "close enough." A false pass here is indistinguishable downstream from
 * a genuine model completeness failure (Bug B), so this must be exact.
 */
export function checkLosslessCoverage(mainText: string, chunks: DocumentChunk[]): LosslessCoverageResult {
  const reconstructed = chunks.map((c) => c.bodyText).join("\n\n")
  const expectedNorm = normalizeForCoverageCheck(mainText)
  const actualNorm = normalizeForCoverageCheck(reconstructed)

  if (expectedNorm === actualNorm) {
    return {
      isLossless: true,
      expectedNormalizedLength: expectedNorm.length,
      actualNormalizedLength: actualNorm.length,
      firstDivergenceOffset: null,
      contextBefore: null,
      missingOrDifferentExpected: null,
      missingOrDifferentActual: null,
    }
  }

  let i = 0
  const minLen = Math.min(expectedNorm.length, actualNorm.length)
  while (i < minLen && expectedNorm[i] === actualNorm[i]) i++

  return {
    isLossless: false,
    expectedNormalizedLength: expectedNorm.length,
    actualNormalizedLength: actualNorm.length,
    firstDivergenceOffset: i,
    contextBefore: expectedNorm.slice(Math.max(0, i - 80), i),
    missingOrDifferentExpected: expectedNorm.slice(i, i + 200),
    missingOrDifferentActual: actualNorm.slice(i, i + 200),
  }
}
