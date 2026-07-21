import { useEffect, useMemo, useState } from "react"
import { Search } from "lucide-react"
import { DocumentCard } from "@/components/dashboard/DocumentCard"
import { listNewsletters, type NewsletterListItem } from "@/lib/api"

const typeLabel: Record<string, string> = {
  whatsNew: "What's New",
  comingSoon: "Coming Soon",
  mixed: "Mixed",
}

function relativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime()
  const minutes = Math.round(diffMs / 60_000)
  if (minutes < 1) return "just now"
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"} ago`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`
  const days = Math.round(hours / 24)
  return `${days} day${days === 1 ? "" : "s"} ago`
}

function rerunNote(item: NewsletterListItem): string | undefined {
  if (!item.isRerun) return undefined
  const priorCount = item.totalRunsForFile - 1
  return `Re-run — ${priorCount} earlier version${priorCount === 1 ? "" : "s"} of this file`
}

interface RecentDocumentsProps {
  onSelect: (id: string) => void
  /** Bumped by the parent after a successful upload, so a freshly-saved newsletter shows up without a manual refresh. */
  refreshKey: number
}

/**
 * The primary surface for finding past work across a growing library of
 * PRDs, not just a "recent activity" log — every saved run, newest first.
 * Optional persistence, reflected honestly in the UI: if the database is
 * unavailable, this section just doesn't render rather than showing an
 * error — the upload flow above it works identically either way.
 */
export function RecentDocuments({ onSelect, refreshKey }: RecentDocumentsProps) {
  const [items, setItems] = useState<NewsletterListItem[] | null>(null)
  const [query, setQuery] = useState("")

  useEffect(() => {
    let cancelled = false
    listNewsletters()
      .then((result) => {
        if (!cancelled) setItems(result)
      })
      .catch(() => {
        if (!cancelled) setItems(null)
      })
    return () => {
      cancelled = true
    }
  }, [refreshKey])

  const filtered = useMemo(() => {
    if (!items) return []
    const normalized = query.trim().toLowerCase()
    if (!normalized) return items
    return items.filter(
      (item) => item.sourceFile.toLowerCase().includes(normalized) || (item.documentTitle ?? "").toLowerCase().includes(normalized),
    )
  }, [items, query])

  if (!items || items.length === 0) return null

  return (
    <section className="w-full max-w-5xl">
      <div className="mb-4 flex items-center justify-between gap-4">
        <h2 className="text-lg font-semibold text-foreground">Newsletter Library</h2>
        <div className="relative w-64">
          <Search className="absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search by filename or title..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-full rounded-md border border-border bg-background py-1.5 pr-3 pl-8 text-sm outline-none focus:border-ring"
          />
        </div>
      </div>
      {filtered.length === 0 ? (
        <p className="text-sm text-muted-foreground">No saved newsletters match "{query}".</p>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((item) => (
            <button key={item.id} type="button" onClick={() => onSelect(item.id)} className="text-left">
              <DocumentCard
                title={item.documentTitle ?? "Untitled document"}
                updatedAt={relativeTime(item.createdAt)}
                status={typeLabel[item.newsletterType] ?? item.newsletterType}
                sourceFile={item.sourceFile}
                rerunNote={rerunNote(item)}
              />
            </button>
          ))}
        </div>
      )}
    </section>
  )
}
