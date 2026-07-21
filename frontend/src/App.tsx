import { useState } from "react"
import { DashboardHeader } from "@/components/dashboard/DashboardHeader"
import { UploadCard } from "@/components/dashboard/UploadCard"
import { NewsletterResult } from "@/components/dashboard/NewsletterResult"
import { RecentDocuments } from "@/components/dashboard/RecentDocuments"
import { getNewsletterById, type UploadSuccessResponse, type VerificationReport, type WriterMetadata } from "@/lib/api"

// Reopening a saved newsletter has no real generation stats (they were
// never stored — only the content and verification report were) and no
// raw/clean source text (nothing in the current UI reads those fields from
// a live upload either). These placeholders let a reopened newsletter reuse
// NewsletterResult/NewsletterEditor completely unchanged.
const PLACEHOLDER_METADATA: WriterMetadata = {
  model: "unknown",
  generationTimeMs: 0,
  possibleOmissions: false,
  missingSections: [],
  navigationPathsPatched: [],
}
const DEFAULT_VERIFICATION: VerificationReport = {
  passed: true,
  blocking: { fabricatedPaths: [], ungroundedItems: [] },
  advisory: { droppedFeatures: [], ungroundedClaims: [] },
  check3Error: null,
}

function App() {
  const [result, setResult] = useState<UploadSuccessResponse | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  // Bumped after every successful upload so RecentDocuments re-fetches and
  // shows the just-saved newsletter without a manual page refresh.
  const [historyRefreshKey, setHistoryRefreshKey] = useState(0)

  const handleSelectHistory = async (id: string) => {
    try {
      const detail = await getNewsletterById(id)
      setResult({
        success: true,
        filename: detail.sourceFile,
        originalName: detail.sourceFile,
        size: 0,
        uploadedAt: detail.createdAt,
        pages: 0,
        textLength: 0,
        rawText: "",
        cleanText: "",
        newsletters: {
          whatsNew: detail.content.whatsNew
            ? { newsletter: detail.content.whatsNew, metadata: PLACEHOLDER_METADATA, verification: detail.verification.whatsNew ?? DEFAULT_VERIFICATION }
            : null,
          comingSoon: detail.content.comingSoon
            ? {
                newsletter: detail.content.comingSoon,
                metadata: PLACEHOLDER_METADATA,
                verification: detail.verification.comingSoon ?? DEFAULT_VERIFICATION,
              }
            : null,
        },
      })
      setErrorMessage(null)
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to load the saved newsletter.")
      setResult(null)
    }
  }

  return (
    <div className="min-h-svh bg-background">
      <main className="mx-auto flex max-w-5xl flex-col items-center gap-12 px-6 pb-20">
        <DashboardHeader />
        <UploadCard
          onComplete={(uploadResult) => {
            setResult(uploadResult)
            setErrorMessage(null)
            setHistoryRefreshKey((key) => key + 1)
          }}
          onError={(message) => {
            setErrorMessage(message)
            setResult(null)
          }}
        />
        <NewsletterResult result={result} errorMessage={errorMessage} />
        <RecentDocuments onSelect={handleSelectHistory} refreshKey={historyRefreshKey} />
      </main>
    </div>
  )
}

export default App
