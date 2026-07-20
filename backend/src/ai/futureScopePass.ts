import type { ExtractedFeature, FeatureExtraction } from "./schemas/featureExtraction.schema"
import type { GroqProvider } from "./providers/groqProvider"

/**
 * Headings that mark a document's forward-looking/roadmap section. Kept
 * intentionally narrow (not a general section-detection framework) — this
 * exists solely to compensate for a confirmed, positional extraction
 * failure: a trailing "Future Scope"-style section is dropped by the main
 * extraction pass regardless of prompt wording, because of where it sits
 * in the document, not how it's formatted.
 */
const FUTURE_SECTION_HEADING_PATTERN =
  /^(future scope|coming soon|roadmap|upcoming(?:\s+features)?|planned features)\b.*$/im

/**
 * Locates a trailing "Future Scope"-style heading in the cleaned document
 * text and returns everything from that heading to the end of the
 * document (heading included) as its own string. Returns null when no
 * such heading exists — callers must treat that as "skip the second
 * pass," not as an error.
 */
export function isolateFutureScopeSection(cleanText: string): string | null {
  const match = FUTURE_SECTION_HEADING_PATTERN.exec(cleanText)
  if (!match) return null

  const section = cleanText.slice(match.index).trim()
  return section.length > 0 ? section : null
}

function defaultToPlanned(feature: ExtractedFeature): ExtractedFeature {
  if (feature.status !== null) return feature
  return { ...feature, status: "planned" }
}

/**
 * Runs the main extraction pass over the full document, then — only when
 * a trailing "Future Scope"-style section is present — runs a second,
 * separate pass over just that isolated section and appends its features
 * onto the main pass's features array. No deduplication is performed:
 * Future Scope items are structurally distinct from the document's
 * Use Case-level features and are not expected to overlap.
 *
 * Every feature from the second pass defaults to status "planned" unless
 * the isolated text itself gave the model explicit evidence otherwise
 * (an explicit status from the model is never overridden).
 *
 * If the second pass fails for any reason (rate limit, validation, etc.),
 * the failure is logged and the main pass's result is returned unchanged
 * — this is a targeted enhancement layered on top of a working pipeline,
 * not a dependency it should be able to take down.
 */
export async function extractFeaturesWithFutureScopePass(
  groqProvider: GroqProvider,
  cleanText: string,
): Promise<FeatureExtraction> {
  const mainResult = await groqProvider.extractFeatures(cleanText)

  const futureScopeText = isolateFutureScopeSection(cleanText)
  if (!futureScopeText) {
    return mainResult
  }

  try {
    const futureScopeResult = await groqProvider.extractFeatures(futureScopeText)
    const plannedFeatures = futureScopeResult.features.map(defaultToPlanned)

    return {
      ...mainResult,
      features: [...mainResult.features, ...plannedFeatures],
    }
  } catch (error) {
    console.error(
      "[futureScopePass] second pass failed, returning main pass result unchanged:",
      error instanceof Error ? error.message : error,
    )
    return mainResult
  }
}
