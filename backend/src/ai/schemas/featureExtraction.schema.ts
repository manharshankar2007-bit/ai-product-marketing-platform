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
    description: z.string().min(1),
    businessBenefit: z.string().nullable(),
    userImpact: z.string().nullable(),
    configuration: z.string().nullable(),
    navigationPath: z.array(z.string()),
    steps: z.array(z.string()),
    limitations: z.string().nullable(),
    rolloutNotes: z.string().nullable(),
    source: FeatureSourceSchema,
  })
  .strict()

export const FeatureExtractionSchema = z
  .object({
    documentTitle: z.string().nullable(),
    releaseName: z.string().nullable(),
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
