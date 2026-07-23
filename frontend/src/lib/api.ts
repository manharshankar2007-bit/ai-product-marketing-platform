export interface WriterMetadata {
  model: string
  generationTimeMs: number
  promptTokens?: number
  completionTokens?: number
  totalTokens?: number
  possibleOmissions: boolean
  missingSections: string[]
  navigationPathsPatched: string[]
}

export interface NewsletterItem {
  name: string
  body: string
}

export interface NewsletterFooter {
  address: string
  city: string
  websiteUrl: string
}

export interface NewsletterJson {
  title: string
  intro: string
  whyBuilt: string | null
  navigation: string[]
  items: NewsletterItem[]
  meansToYou: string[]
  whatsNext: string
  footer: NewsletterFooter
}

export interface UngroundedClaim {
  claim: string
  why_ungrounded: string
}

export interface VerificationReport {
  passed: boolean
  blocking: {
    fabricatedPaths: string[]
    ungroundedItems: string[]
  }
  advisory: {
    droppedFeatures: string[]
    ungroundedClaims: UngroundedClaim[]
  }
  check3Error: string | null
}

export interface NewsletterSection {
  newsletter: NewsletterJson
  metadata: WriterMetadata
  verification: VerificationReport
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
  newsletters: {
    whatsNew: NewsletterSection | null
    comingSoon: NewsletterSection | null
  }
}

interface UploadErrorResponse {
  success: false
  message: string
}

type UploadResponse = UploadSuccessResponse | UploadErrorResponse

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:4000"

export interface NewsletterListItem {
  id: string
  sourceFile: string
  documentTitle: string | null
  newsletterType: string
  createdAt: string
  /** True when other saved runs share this exact sourceFile — a re-run, not a fresh document. */
  isRerun: boolean
  /** Total number of saved runs (including this one) sharing this sourceFile. */
  totalRunsForFile: number
}

export interface NewsletterDetail {
  id: string
  sourceFile: string
  documentTitle: string | null
  newsletterType: string
  createdAt: string
  content: {
    whatsNew: NewsletterJson | null
    comingSoon: NewsletterJson | null
  }
  verification: {
    whatsNew: VerificationReport | null
    comingSoon: VerificationReport | null
  }
}

/** Optional persistence — see backend/src/db/newsletterHistory.ts. If the database is unavailable, this simply fails like any other fetch; the upload flow never depends on it. */
export async function listNewsletters(): Promise<NewsletterListItem[]> {
  const res = await fetch(`${API_BASE_URL}/api/newsletters`)
  if (!res.ok) throw new Error(`Failed to load saved newsletters (HTTP ${res.status}).`)
  const body = (await res.json()) as { success: true; newsletters: NewsletterListItem[] }
  return body.newsletters
}

export async function getNewsletterById(id: string): Promise<NewsletterDetail> {
  const res = await fetch(`${API_BASE_URL}/api/newsletters/${id}`)
  if (!res.ok) throw new Error(`Failed to load newsletter (HTTP ${res.status}).`)
  const body = (await res.json()) as { success: true } & NewsletterDetail
  return body
}

export async function deleteNewsletter(id: string): Promise<void> {
  const res = await fetch(`${API_BASE_URL}/api/newsletters/${id}`, { method: "DELETE" })
  if (!res.ok) throw new Error(`Failed to delete newsletter (HTTP ${res.status}).`)
}

/**
 * Uploads a PDF to the backend and waits for the fully generated
 * newsletter. Uses XMLHttpRequest (rather than fetch) specifically because
 * it exposes real upload-progress events via `xhr.upload.onprogress`.
 */
export function uploadDocument(
  file: File,
  onUploadProgress?: (percent: number) => void,
): Promise<UploadSuccessResponse> {
  return new Promise((resolve, reject) => {
    const formData = new FormData()
    formData.append("file", file)

    const xhr = new XMLHttpRequest()
    xhr.open("POST", `${API_BASE_URL}/api/documents/upload`)

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable && onUploadProgress) {
        onUploadProgress(Math.round((event.loaded / event.total) * 100))
      }
    }

    xhr.onload = () => {
      let body: UploadResponse | null = null
      try {
        body = JSON.parse(xhr.responseText) as UploadResponse
      } catch {
        reject(new Error("The server returned an unreadable response."))
        return
      }

      if (xhr.status >= 200 && xhr.status < 300 && body.success) {
        resolve(body)
        return
      }

      reject(new Error(body.success === false ? body.message : `Upload failed (HTTP ${xhr.status}).`))
    }

    xhr.onerror = () => {
      reject(new Error("Could not reach the server. Is the backend running?"))
    }

    xhr.send(formData)
  })
}
