import type { ExtractedFeature, FeatureExtraction } from "../ai/schemas/featureExtraction.schema"
import {
  MalformedExtractionInputError,
  type NewsletterBuilderOutput,
  type NewsletterBuilderWarning,
  type NewsletterFeatureItem,
  type NewsletterStats,
  type NewsletterType,
} from "./types"

/** Bump this constant whenever the builder's output shape changes. */
export const NEWSLETTER_BUILDER_VERSION = "2.0.0"

const REQUIRED_ARRAY_FIELDS = [
  "features",
  "uiChanges",
  "enhancements",
  "bugFixes",
  "knownLimitations",
] as const

const REQUIRED_METADATA_FIELDS = ["documentTitle", "releaseName"] as const

function assertValidInput(input: FeatureExtraction): void {
  if (input === null || typeof input !== "object") {
    throw new MalformedExtractionInputError("Extraction input must be a non-null object")
  }

  for (const field of REQUIRED_METADATA_FIELDS) {
    if (!(field in input)) {
      throw new MalformedExtractionInputError(`Extraction input is missing required field "${field}"`)
    }
  }

  for (const field of REQUIRED_ARRAY_FIELDS) {
    if (!(field in input)) {
      throw new MalformedExtractionInputError(`Extraction input is missing required field "${field}"`)
    }
    if (!Array.isArray(input[field])) {
      throw new MalformedExtractionInputError(`Extraction input field "${field}" must be an array`)
    }
  }
}

function featureToItem(feature: ExtractedFeature): NewsletterFeatureItem {
  return {
    kind: "feature",
    title: feature.title,
    status: feature.status,
    description: feature.description,
    businessBenefit: feature.businessBenefit,
    userImpact: feature.userImpact,
    configuration: feature.configuration,
    navigationPath: feature.navigationPath,
    steps: feature.steps,
    limitations: feature.limitations,
    rolloutNotes: feature.rolloutNotes,
    source: feature.source,
  }
}

function determineNewsletterType(hasWhatsNew: boolean, hasComingSoon: boolean): NewsletterType {
  if (hasWhatsNew && !hasComingSoon) return "whats_new"
  if (hasComingSoon && !hasWhatsNew) return "coming_soon"
  return "mixed"
}

/**
 * Transforms validated extraction JSON into deterministic, classified
 * newsletter input. No AI, no network calls, no randomness — same input
 * always produces the same output.
 */
export function buildNewsletter(input: FeatureExtraction): NewsletterBuilderOutput {
  assertValidInput(input)

  const warnings: NewsletterBuilderWarning[] = []
  const whatsNew: NewsletterFeatureItem[] = []
  const comingSoon: NewsletterFeatureItem[] = []
  const unclassified: NewsletterFeatureItem[] = []
  const seenTitles = new Set<string>()

  let shipped = 0
  let inProgress = 0
  let planned = 0

  for (const feature of input.features) {
    const title = feature.title?.trim() ?? ""

    if (!title) {
      warnings.push({
        code: "missing_title",
        message: "A feature is missing a title.",
      })
    } else if (seenTitles.has(title)) {
      warnings.push({
        code: "duplicate_title",
        message: `Duplicate feature title found: "${title}".`,
        title,
      })
    } else {
      seenTitles.add(title)
    }

    const item = featureToItem(feature)

    if (feature.status === "shipped") {
      shipped += 1
      whatsNew.push(item)
    } else if (feature.status === "in_progress") {
      inProgress += 1
      whatsNew.push(item)
    } else if (feature.status === "planned") {
      planned += 1
      comingSoon.push(item)
    } else {
      unclassified.push(item)
      warnings.push({
        code: "missing_status",
        message: `Feature "${title || "(untitled)"}" has no status and could not be classified into whatsNew or comingSoon.`,
        ...(title ? { title } : {}),
      })
    }
  }

  const hasWhatsNew = whatsNew.length > 0
  const hasComingSoon = comingSoon.length > 0
  const newsletterType = determineNewsletterType(hasWhatsNew, hasComingSoon)

  // A release that is purely "what's new" or purely "coming soon" is
  // valid and expected — only warn when there is nothing classified at
  // all (both buckets empty, which is equivalent to "no classified
  // features" since uiChanges/enhancements/bugFixes no longer feed into
  // whatsNew).
  if (!hasWhatsNew && !hasComingSoon) {
    warnings.push({
      code: "no_classified_features",
      message:
        "Both whatsNew and comingSoon are empty — no features were classified. This likely indicates a data quality problem upstream rather than a real empty release.",
    })
  }

  const stats: NewsletterStats = {
    totalFeatures: input.features.length,
    shipped,
    inProgress,
    planned,
    unclassified: unclassified.length,
    uiChanges: input.uiChanges.length,
    enhancements: input.enhancements.length,
    bugFixes: input.bugFixes.length,
  }

  return {
    metadata: {
      documentTitle: input.documentTitle,
      releaseName: input.releaseName,
      builderVersion: NEWSLETTER_BUILDER_VERSION,
    },
    newsletterType,
    whatsNew,
    comingSoon,
    unclassified,
    uiChanges: [...input.uiChanges],
    enhancements: [...input.enhancements],
    bugFixes: [...input.bugFixes],
    knownLimitations: [...input.knownLimitations],
    warnings,
    stats,
  }
}
