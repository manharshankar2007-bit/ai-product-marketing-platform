import type { WriterProviderMetadata } from "../writer/writerProvider"
import type { NewsletterJson } from "../writer/newsletterOutput.schema"

export interface NewsletterSection {
  newsletter: NewsletterJson
  metadata: WriterProviderMetadata
}

export interface UploadSuccessResponse {
  success: true
  filename: string
  originalName: string
  size: number
  uploadedAt: string
  pages: number
  textLength: number
  rawText: string
  cleanText: string
  /** Null when the release has no content of that kind — e.g. a pure What's New release has comingSoon: null. */
  newsletters: {
    whatsNew: NewsletterSection | null
    comingSoon: NewsletterSection | null
  }
}

export interface UploadErrorResponse {
  success: false
  message: string
}
