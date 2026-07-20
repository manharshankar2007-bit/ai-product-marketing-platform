import type { FeatureSource, FeatureStatus } from "../ai/schemas/featureExtraction.schema"

export type NewsletterType = "whats_new" | "coming_soon" | "mixed"

export interface NewsletterMetadata {
  documentTitle: string | null
  releaseName: string | null
  builderVersion: string
  /** Pass-through from FeatureExtraction — see featureExtraction.schema.ts. Gives the Writer's Slot 2/3/5 instructions their source data. */
  problemStatement: string | null
  whyBuilt: string | null
  releasePlan: string[]
}

/**
 * A fully classified feature, carried through unchanged from extraction.
 * whatsNew, comingSoon, and unclassified are all arrays of this shape —
 * uiChanges/enhancements/bugFixes are separate plain string[] arrays (see
 * NewsletterBuilderOutput) and are never mixed into these.
 */
export interface NewsletterFeatureItem {
  kind: "feature"
  title: string
  status: FeatureStatus
  description: string
  businessBenefit: string | null
  userImpact: string | null
  configuration: string | null
  navigationPath: string[]
  steps: string[]
  limitations: string | null
  rolloutNotes: string | null
  /** Exact title of the feature this one is structurally nested under, or null if top-level. See featureExtraction.schema.ts. */
  parentTitle: string | null
  source: FeatureSource
}

export interface NewsletterStats {
  totalFeatures: number
  shipped: number
  inProgress: number
  planned: number
  unclassified: number
  uiChanges: number
  enhancements: number
  bugFixes: number
}

export interface NewsletterBuilderOutput {
  metadata: NewsletterMetadata
  newsletterType: NewsletterType
  whatsNew: NewsletterFeatureItem[]
  comingSoon: NewsletterFeatureItem[]
  /**
   * Features with status: null. Kept as its own array (not merged or
   * dropped) so null-status features are never silently discarded — see
   * the "missing_status" warning, which is raised for every item here.
   */
  unclassified: NewsletterFeatureItem[]
  uiChanges: string[]
  enhancements: string[]
  bugFixes: string[]
  knownLimitations: string[]
  warnings: NewsletterBuilderWarning[]
  stats: NewsletterStats
}

export type NewsletterBuilderWarningCode =
  | "missing_status"
  | "missing_title"
  | "duplicate_title"
  | "no_classified_features"

export interface NewsletterBuilderWarning {
  code: NewsletterBuilderWarningCode
  message: string
  /** Present when the warning is traceable to a specific feature title. */
  title?: string
}

/**
 * Thrown only for structurally unrecoverable input — a required top-level
 * key is missing entirely, or a field that must be an array is not one.
 * This module assumes the extraction schema has already been Zod-validated
 * upstream; this error exists as a defensive backstop, not a re-validation
 * pass.
 */
export class MalformedExtractionInputError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "MalformedExtractionInputError"
  }
}
