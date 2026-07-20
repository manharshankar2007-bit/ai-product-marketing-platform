import { z } from "zod"

/**
 * What the MODEL is asked to return — title/intro/whyBuilt/items/meansToYou
 * only. Navigation, whatsNext, and footer are never requested from the
 * model; they're assembled in code (see writerProvider.ts) and merged into
 * NewsletterJsonSchema afterward.
 */
export const ModelNewsletterJsonSchema = z
  .object({
    title: z.string().min(1),
    intro: z.string().min(1),
    whyBuilt: z.string().nullable(),
    items: z.array(
      z
        .object({
          name: z.string().min(1),
          body: z.string().min(1),
        })
        .strict(),
    ),
    meansToYou: z.array(z.string()),
  })
  .strict()

export type ModelNewsletterJson = z.infer<typeof ModelNewsletterJsonSchema>

export const NewsletterFooterSchema = z
  .object({
    address: z.string(),
    city: z.string(),
    websiteUrl: z.string(),
  })
  .strict()

export type NewsletterFooter = z.infer<typeof NewsletterFooterSchema>

/**
 * The full, final structured newsletter — what generateNewsletter() returns
 * and what the frontend renders. Superset of ModelNewsletterJsonSchema plus
 * the three code-assembled fields (navigation, whatsNext, footer).
 */
export const NewsletterJsonSchema = ModelNewsletterJsonSchema.extend({
  navigation: z.array(z.string()),
  whatsNext: z.string(),
  footer: NewsletterFooterSchema,
})

export type NewsletterJson = z.infer<typeof NewsletterJsonSchema>
