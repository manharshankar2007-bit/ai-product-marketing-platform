import { z } from "zod"

/**
 * Status is only ever set from an explicit statement in the source document
 * (e.g. "currently available", "Phase 1", "future phase"). It is never
 * inferred from tone, and defaults to null when the document doesn't say.
 */
export const FeatureStatusSchema = z.enum(["shipped", "in_progress", "planned"]).nullable()

/**
 * The pipeline that feeds this schema (PDF -> text extraction -> cleaning)
 * does not preserve page boundaries, so `page` is always null. `excerpt` is
 * also always null — this module does not attempt to select or quote
 * supporting text, to avoid the model paraphrasing content into this field.
 */
export const FeatureSourceSchema = z
  .object({
    page: z.null(),
    excerpt: z.string().nullable(),
  })
  .strict()

export const FeatureSchema = z
  .object({
    title: z.string().min(1),
    status: FeatureStatusSchema,
    // Nullable: a terse, tabular source entry (e.g. "Feature | Future
    // phase" with no prose) legitimately has no descriptive sentence to
    // extract. The model reporting null here is honest, not a failure —
    // rejecting the whole batch over one such entry would be worse than
    // rendering a deterministic fallback for it (see
    // newsletter/builder.ts's featureToItem).
    description: z.string().min(1).nullable(),
    businessBenefit: z.string().nullable(),
    userImpact: z.string().nullable(),
    configuration: z.string().nullable(),
    navigationPath: z.array(z.string()),
    steps: z.array(z.string()),
    limitations: z.string().nullable(),
    rolloutNotes: z.string().nullable(),
    // Structural nesting only (heading hierarchy), never a semantic/topical
    // relatedness guess. null when the feature is top-level. See
    // extractor.md's "parentTitle" section for the extraction rule.
    parentTitle: z.string().nullable(),
    source: FeatureSourceSchema,
  })
  .strict()

export const FeatureExtractionSchema = z
  .object({
    documentTitle: z.string().nullable(),
    releaseName: z.string().nullable(),
    // Document-level rationale fields — additive, same null-if-absent
    // discipline as every other optional field in this schema. See
    // extractor.md for extraction rules.
    problemStatement: z.string().nullable(),
    whyBuilt: z.string().nullable(),
    // Schema-level tolerance, not prompt guidance: observed live, the model
    // returns null here (not []) on some chunks despite extractor.md saying
    // "[] if absent" — a soft prompt instruction the model honors most but
    // not all of the time. A crashed FeatureExtractionSchema.strict() parse
    // used to kill the entire run before chunk 1. `.default()` alone only
    // fires on `undefined`, never on a literal `null` — the actual observed
    // failure — so a `.transform()` is used instead to coerce null to []
    // deterministically. Same "move the guarantee from prompt to code"
    // principle as every other rule already moved there (title
    // normalization, null-description filter, parent/child dedupe).
    releasePlan: z
      .array(z.string())
      .nullable()
      .transform((value) => value ?? []),
    features: z.array(FeatureSchema),
    uiChanges: z.array(z.string()),
    enhancements: z.array(z.string()),
    bugFixes: z.array(z.string()),
    knownLimitations: z.array(z.string()),
  })
  .strict()

export type FeatureStatus = z.infer<typeof FeatureStatusSchema>
export type FeatureSource = z.infer<typeof FeatureSourceSchema>
export type ExtractedFeature = z.infer<typeof FeatureSchema>
export type FeatureExtraction = z.infer<typeof FeatureExtractionSchema>
