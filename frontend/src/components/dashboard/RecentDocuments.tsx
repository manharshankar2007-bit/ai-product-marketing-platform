import { useEffect, useMemo, useState } from "react"
import { Search } from "lucide-react"
import { DocumentCard } from "@/components/dashboard/DocumentCard"
import { deleteNewsletter, listNewsletters, type NewsletterListItem } from "@/lib/api"

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

  const handleDelete = async (id: string) => {
    // Optimistic-ish: only remove from the visible list once the server
    // confirms the delete, so a failed request doesn't silently vanish an
    // entry the user still has (they can just try again).
    try {
      await deleteNewsletter(id)
      setItems((prev) => prev?.filter((item) => item.id !== id) ?? prev)
    } catch (error) {
      console.error("Failed to delete newsletter:", error instanceof Error ? error.message : error)
    }
  }

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
        <h2 className="font-display text-xl font-black uppercase tracking-tight text-[#1A1A1A]">Newsletter Library</h2>
        <div className="relative w-64">
          <Search className="absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-gray-500" />
          <input
            type="text"
            placeholder="Search by filename or title..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-full border-2 border-black bg-white py-1.5 pr-3 pl-8 text-sm font-medium text-[#1A1A1A] outline-none placeholder:text-gray-400 focus:shadow-[3px_3px_0px_0px_rgba(0,0,0,1)]"
          />
        </div>
      </div>
      {filtered.length === 0 ? (
        <p className="text-sm font-medium text-gray-500">No saved newsletters match "{query}".</p>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((item) => (
            <div
              key={item.id}
              role="button"
              tabIndex={0}
              onClick={() => onSelect(item.id)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault()
                  onSelect(item.id)
                }
              }}
              className="cursor-pointer text-left"
            >
              <DocumentCard
                title={item.documentTitle ?? "Untitled document"}
                updatedAt={relativeTime(item.createdAt)}
                status={typeLabel[item.newsletterType] ?? item.newsletterType}
                sourceFile={item.sourceFile}
                rerunNote={rerunNote(item)}
                onDelete={() => handleDelete(item.id)}
              />
            </div>
          ))}
        </div>
      )}
    </section>
  )
}
