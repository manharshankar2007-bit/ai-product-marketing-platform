import { useState } from "react"
import { AlertTriangle, RotateCcw } from "lucide-react"
import NewsletterPreview from "./NewsletterPreview"
import { renderStandaloneDocument, renderPlainText, type ExportSection } from "@/lib/newsletterExport"
import type { NewsletterJson, UploadSuccessResponse, VerificationReport, WriterMetadata } from "@/lib/api"

/**
 * Detect-and-report only — this never blocks anything, it's a status line.
 * Blocking signals represent possible fabrication. Advisory signals are
 * intentionally quiet: Slot 5 curates source features and Check 3 is a
 * high-recall review aid, so neither should turn a grounded draft red.
 */
function VerificationStatus({ verification }: { verification: VerificationReport }) {
  const fabricationIssues = verification.blocking.fabricatedPaths.length + verification.blocking.ungroundedItems.length
  const advisoryCount = verification.advisory.droppedFeatures.length + verification.advisory.ungroundedClaims.length

  if (verification.passed) {
    return (
      <p className="flex items-center gap-1.5 text-xs font-bold uppercase text-emerald-700">
        <span className="inline-block size-1.5 rounded-full bg-emerald-600" />
        Verified: all content grounded in source
      </p>
    )
  }

  return (
    <div className="space-y-0.5 text-xs font-bold uppercase">
      <p className="flex items-center gap-1.5 text-amber-700">
        <AlertTriangle className="size-3.5" />
        {fabricationIssues} possible fabrication{fabricationIssues === 1 ? "" : "s"} — review flagged items
      </p>
      {advisoryCount > 0 && <p className="text-gray-500">{advisoryCount} advisory signal{advisoryCount === 1 ? "" : "s"}</p>}
      {verification.check3Error && (
        <p className="text-gray-500">Note: the AI grounding check did not complete ({verification.check3Error}).</p>
      )}
    </div>
  )
}

function NewsletterCard({
  title,
  newsletter,
  metadata,
  verification,
  onChange,
}: {
  title: string
  newsletter: NewsletterJson
  metadata: WriterMetadata
  verification: VerificationReport
  onChange: (updated: NewsletterJson) => void
}) {
  const exportSections: ExportSection[] = [{ newsletter, itemsHeading: title }]
  const htmlCode = renderStandaloneDocument(exportSections, title)
  const markdownCode = renderPlainText(exportSections)

  return (
    <div className="w-full max-w-3xl">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div>
          <p className="font-display text-2xl font-black uppercase tracking-tight text-[#1A1A1A]">{title}</p>
          <p className="font-mono text-[11px] font-bold uppercase tracking-wide text-gray-500">
            Generated in {(metadata.generationTimeMs / 1000).toFixed(1)}s
          </p>
          <div className="mt-1">
            <VerificationStatus verification={verification} />
          </div>
        </div>
      </div>
      <NewsletterPreview htmlCode={htmlCode} markdownCode={markdownCode} newsletter={newsletter} onNewsletterChange={onChange} />
      {(metadata.possibleOmissions || metadata.missingSections.length > 0) && (
        <div className="mt-3 space-y-1 border-2 border-black bg-[#F3F4F6] p-3 text-xs font-bold text-gray-700">
          {metadata.possibleOmissions && (
            <p>Heads up: some extracted features may be missing from this draft — worth a quick review.</p>
          )}
          {metadata.missingSections.length > 0 && <p>Missing expected sections: {metadata.missingSections.join(", ")}</p>}
        </div>
      )}
    </div>
  )
}

function NewsletterReview({ result }: { result: UploadSuccessResponse }) {
  const { whatsNew, comingSoon } = result.newsletters
  // Local, editable copies of the generated content — edits here never touch
  // the server; they only affect what this session previews/exports.
  const [whatsNewJson, setWhatsNewJson] = useState<NewsletterJson | null>(whatsNew?.newsletter ?? null)
  const [comingSoonJson, setComingSoonJson] = useState<NewsletterJson | null>(comingSoon?.newsletter ?? null)

  if (!whatsNew && !comingSoon) {
    return (
      <div className="flex w-full max-w-3xl items-center gap-3 border-4 border-black bg-white p-6 shadow-[6px_6px_0px_0px_rgba(0,0,0,1)]">
        <RotateCcw className="size-6 shrink-0 text-gray-400" />
        <div>
          <p className="font-display text-sm font-black uppercase text-[#1A1A1A]">No Newsletter Generated</p>
          <p className="text-sm text-gray-600">No shipped, in-progress, or planned features were found in this document.</p>
        </div>
      </div>
    )
  }

  const combinedSections: ExportSection[] = [
    ...(whatsNewJson ? [{ newsletter: whatsNewJson, itemsHeading: "What's New" }] : []),
    ...(comingSoonJson ? [{ newsletter: comingSoonJson, itemsHeading: "Coming Soon" }] : []),
  ]
  const isMixed = Boolean(whatsNew) && Boolean(comingSoon)

  return (
    <div className="flex w-full max-w-3xl flex-col gap-8">
      {whatsNew && whatsNewJson && (
        <NewsletterCard
          title="What's New"
          newsletter={whatsNewJson}
          metadata={whatsNew.metadata}
          verification={whatsNew.verification}
          onChange={setWhatsNewJson}
        />
      )}
      {comingSoon && comingSoonJson && (
        <NewsletterCard
          title="Coming Soon"
          newsletter={comingSoonJson}
          metadata={comingSoon.metadata}
          verification={comingSoon.verification}
          onChange={setComingSoonJson}
        />
      )}
      {isMixed && (
        <div className="w-full max-w-3xl">
          <p className="font-display mb-2 text-xs font-black uppercase tracking-wide text-gray-500">
            Combined Digest &middot; both newsletters as one document, clearly separated
          </p>
          <NewsletterPreview
            htmlCode={renderStandaloneDocument(combinedSections, "Newsletter")}
            markdownCode={renderPlainText(combinedSections)}
          />
        </div>
      )}
    </div>
  )
}

interface NewsletterResultProps {
  result: UploadSuccessResponse | null
  errorMessage: string | null
}

export function NewsletterResult({ result, errorMessage }: NewsletterResultProps) {
  if (!result && !errorMessage) return null

  if (errorMessage) {
    return (
      <div className="flex w-full max-w-3xl items-center gap-3 border-4 border-black bg-white p-6 shadow-[6px_6px_0px_0px_rgba(0,0,0,1)]">
        <AlertTriangle className="size-6 shrink-0 text-red-600" />
        <div>
          <p className="font-display text-sm font-black uppercase text-[#1A1A1A]">Upload Failed</p>
          <p className="text-sm text-red-600">{errorMessage}</p>
        </div>
      </div>
    )
  }

  // Keyed so switching to a different upload/saved newsletter resets the
  // editable state below instead of carrying over edits from a prior one.
  return <NewsletterReview key={`${result!.filename}-${result!.uploadedAt}`} result={result!} />
}
