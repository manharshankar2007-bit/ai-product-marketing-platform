import { useEffect, useState } from "react"
import { Copy, Download, RotateCcw } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { NewsletterEditor } from "./NewsletterEditor"
import { copyHtmlToClipboard, downloadHtml, type ExportSection } from "@/lib/newsletterExport"
import type { NewsletterJson, NewsletterSection, UploadSuccessResponse } from "@/lib/api"

function slugify(title: string): string {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || "newsletter"
}

function ExportButtons({ sections, documentTitle, filename }: { sections: ExportSection[]; documentTitle: string; filename: string }) {
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    await copyHtmlToClipboard(sections)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="flex gap-2">
      <Button size="sm" variant="outline" onClick={() => downloadHtml(sections, documentTitle, filename)}>
        <Download /> Download HTML
      </Button>
      <Button size="sm" variant="outline" onClick={handleCopy}>
        <Copy /> {copied ? "Copied!" : "Copy HTML"}
      </Button>
    </div>
  )
}

function NewsletterCard({
  title,
  section,
  draft,
  onChange,
  onReset,
}: {
  title: string
  section: NewsletterSection
  draft: NewsletterJson
  onChange: (newsletter: NewsletterJson) => void
  onReset: () => void
}) {
  return (
    <Card className="w-full max-w-2xl">
      <CardHeader className="flex flex-row items-start justify-between gap-2">
        <div>
          <CardTitle>{title}</CardTitle>
          <CardDescription>generated in {(section.metadata.generationTimeMs / 1000).toFixed(1)}s</CardDescription>
        </div>
        <Button variant="ghost" size="sm" onClick={onReset}>
          <RotateCcw /> Reset to AI draft
        </Button>
      </CardHeader>
      <CardContent>
        <NewsletterEditor newsletter={draft} onChange={onChange} itemsHeading={title} />
        {(section.metadata.possibleOmissions || section.metadata.missingSections.length > 0) && (
          <div className="mt-3 space-y-1 rounded-md border border-border bg-muted/30 p-3 text-xs text-muted-foreground">
            {section.metadata.possibleOmissions && (
              <p>Heads up: some extracted features may be missing from this draft &mdash; worth a quick review.</p>
            )}
            {section.metadata.missingSections.length > 0 && (
              <p>Missing expected sections: {section.metadata.missingSections.join(", ")}</p>
            )}
          </div>
        )}
        <div className="mt-3">
          <ExportButtons sections={[{ newsletter: draft, itemsHeading: title }]} documentTitle={title} filename={`${slugify(title)}.html`} />
        </div>
      </CardContent>
    </Card>
  )
}

function NewsletterReview({ result }: { result: UploadSuccessResponse }) {
  const { whatsNew, comingSoon } = result.newsletters

  const [whatsNewDraft, setWhatsNewDraft] = useState<NewsletterJson | null>(whatsNew?.newsletter ?? null)
  const [comingSoonDraft, setComingSoonDraft] = useState<NewsletterJson | null>(comingSoon?.newsletter ?? null)

  // Re-sync drafts whenever a new upload produces new AI output — draft
  // state must never survive across a genuinely new result.
  useEffect(() => {
    setWhatsNewDraft(whatsNew?.newsletter ?? null)
  }, [whatsNew])
  useEffect(() => {
    setComingSoonDraft(comingSoon?.newsletter ?? null)
  }, [comingSoon])

  if (!whatsNew && !comingSoon) {
    return (
      <Card className="w-full max-w-2xl">
        <CardHeader>
          <CardTitle>No Newsletter Generated</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            No shipped, in-progress, or planned features were found in this document.
          </p>
        </CardContent>
      </Card>
    )
  }

  const combinedSections: ExportSection[] = [
    ...(whatsNewDraft ? [{ newsletter: whatsNewDraft, itemsHeading: "What's New" }] : []),
    ...(comingSoonDraft ? [{ newsletter: comingSoonDraft, itemsHeading: "Coming Soon" }] : []),
  ]
  const isMixed = Boolean(whatsNew) && Boolean(comingSoon)

  return (
    <div className="flex w-full max-w-2xl flex-col gap-6">
      {whatsNew && whatsNewDraft && (
        <NewsletterCard
          title="What's New"
          section={whatsNew}
          draft={whatsNewDraft}
          onChange={setWhatsNewDraft}
          onReset={() => setWhatsNewDraft(whatsNew.newsletter)}
        />
      )}
      {comingSoon && comingSoonDraft && (
        <NewsletterCard
          title="Coming Soon"
          section={comingSoon}
          draft={comingSoonDraft}
          onChange={setComingSoonDraft}
          onReset={() => setComingSoonDraft(comingSoon.newsletter)}
        />
      )}
      {isMixed && (
        <Card className="w-full max-w-2xl">
          <CardHeader>
            <CardTitle>Export Combined</CardTitle>
            <CardDescription>Both newsletters as one document, clearly separated.</CardDescription>
          </CardHeader>
          <CardContent>
            <ExportButtons sections={combinedSections} documentTitle="Newsletter" filename="newsletter-combined.html" />
          </CardContent>
        </Card>
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
      <Card className="w-full max-w-2xl">
        <CardHeader>
          <CardTitle>Upload Failed</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-destructive">{errorMessage}</p>
        </CardContent>
      </Card>
    )
  }

  return <NewsletterReview result={result!} />
}
