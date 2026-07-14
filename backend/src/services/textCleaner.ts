/**
 * Whitespace/formatting normalizer for raw PDF-extracted text.
 *
 * This module never touches the actual content of the text — no words,
 * numbers, feature names, section titles, or table cells are added,
 * removed, reordered, or rewritten. It only normalizes line endings and
 * whitespace so the text is easier to read and render.
 */

function normalizeLineEndings(text: string): string {
  return text.replace(/\r\n/g, "\n").replace(/\r/g, "\n")
}

function trimTrailingWhitespacePerLine(text: string): string {
  return text
    .split("\n")
    .map((line) => line.replace(/[ \t]+$/, ""))
    .join("\n")
}

/**
 * A line is treated as "table-like" (columns separated by padding) when it
 * contains a tab, or more than one run of 2+ spaces — a single double-space
 * is normal prose (e.g. after a period), but two or more such gaps almost
 * always mean the extractor preserved column alignment. Table-like lines are
 * left untouched so columns stay readable.
 */
function looksLikeTableRow(line: string): boolean {
  if (/\t/.test(line)) return true
  const multiSpaceGroups = line.match(/ {2,}/g)
  return (multiSpaceGroups?.length ?? 0) >= 2
}

/**
 * Collapses runs of 2+ inline spaces into a single space, but:
 * - leaves leading whitespace/indentation untouched (preserves bullet and
 *   heading indentation)
 * - skips table-like lines entirely (preserves column alignment)
 */
function normalizeInlineSpacing(text: string): string {
  return text
    .split("\n")
    .map((line) => {
      const leadingWhitespace = line.match(/^[ \t]*/)?.[0] ?? ""
      const rest = line.slice(leadingWhitespace.length)

      if (looksLikeTableRow(rest)) {
        return leadingWhitespace + rest
      }

      return leadingWhitespace + rest.replace(/ {2,}/g, " ")
    })
    .join("\n")
}

/**
 * More than two consecutive blank lines (i.e. 4+ consecutive newlines) is
 * collapsed down to exactly two blank lines (3 newlines), which keeps
 * paragraph breaks intact while removing excessive gaps.
 */
function collapseExcessiveBlankLines(text: string): string {
  return text.replace(/\n{4,}/g, "\n\n\n")
}

export function cleanExtractedText(rawText: string): string {
  let text = normalizeLineEndings(rawText)
  text = trimTrailingWhitespacePerLine(text)
  text = normalizeInlineSpacing(text)
  text = collapseExcessiveBlankLines(text)
  return text.trim()
}

/**
 * ---------------------------------------------------------------------------
 * Unit-test-style examples (before -> after)
 * ---------------------------------------------------------------------------
 *
 * 1. Line endings + trailing whitespace + excessive blank lines
 *
 *   input:
 *     "Line one.   \r\n\r\nLine two.\r\n\r\n\r\n\r\nLine three.   \r\n"
 *
 *   cleanExtractedText(input) =>
 *     "Line one.\n\nLine two.\n\n\nLine three."
 *
 *   (CRLF -> LF, trailing spaces stripped, 4 blank-line gap capped at 2)
 *
 * 2. Paragraphs are preserved
 *
 *   input:
 *     "First paragraph about the export feature.\n\nSecond paragraph about pricing."
 *
 *   cleanExtractedText(input) =>
 *     "First paragraph about the export feature.\n\nSecond paragraph about pricing."
 *
 *   (unchanged — single blank line between paragraphs is left as-is)
 *
 * 3. Bullet points are preserved (including nested indentation)
 *
 *   input:
 *     "Key Features:\n  - Real-time    sync\n    * Offline mode\n  - Export to PDF"
 *
 *   cleanExtractedText(input) =>
 *     "Key Features:\n  - Real-time sync\n    * Offline mode\n  - Export to PDF"
 *
 *   (leading indentation kept; the accidental double-space inside
 *   "Real-time    sync" is collapsed since that line isn't table-like)
 *
 * 4. Headings and section titles are preserved
 *
 *   input:
 *     "SECTION 2: PRICING OVERVIEW\n\nThe Pro plan costs $49/month."
 *
 *   cleanExtractedText(input) =>
 *     "SECTION 2: PRICING OVERVIEW\n\nThe Pro plan costs $49/month."
 *
 *   (heading text and casing untouched — nothing is rewritten or removed)
 *
 * 5. Tables are preserved (column alignment kept)
 *
 *   input:
 *     "Plan        Price      Seats\nFree        $0         1\nPro         $49        5\n"
 *
 *   cleanExtractedText(input) =>
 *     "Plan        Price      Seats\nFree        $0         1\nPro         $49        5"
 *
 *   (each row has 2+ multi-space gaps, so it's detected as table-like and
 *   the column spacing is left exactly as extracted)
 * ---------------------------------------------------------------------------
 */
