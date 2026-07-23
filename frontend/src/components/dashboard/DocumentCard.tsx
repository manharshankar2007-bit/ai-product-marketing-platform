import { useState } from "react"
import { FileText, Trash2 } from "lucide-react"

export interface DocumentCardProps {
  title: string
  updatedAt: string
  /** A short label — e.g. a lifecycle status ("Draft"/"Ready"/"Archived") or a newsletter type ("What's New"/"Mixed"). Anything else falls back to the neutral badge style. */
  status: string
  sourceFile: string
  /** Set when other saved runs share this exact sourceFile — shown as a quiet note, not a warning; re-running a PRD is normal library usage, not an error. */
  rerunNote?: string
  /** Omit to hide the delete control entirely. */
  onDelete?: () => void
}

const statusStyle: Record<string, string> = {
  Draft: "bg-[#F3F4F6] text-gray-700",
  Ready: "bg-[#E0FF00] text-[#1A1A1A]",
  Archived: "bg-white text-gray-500",
}

export function DocumentCard({ title, updatedAt, status, sourceFile, rerunNote, onDelete }: DocumentCardProps) {
  const [confirming, setConfirming] = useState(false)

  return (
    <div className="h-full border-4 border-black bg-white p-4 shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] transition-transform hover:-translate-y-0.5">
      <div className="flex items-start justify-between gap-2">
        <div className="flex size-9 items-center justify-center border-2 border-black bg-[#F3F4F6]">
          <FileText className="size-4 text-[#1A1A1A]" />
        </div>
        <div className="flex items-center gap-1.5">
          <span
            className={`border-2 border-black px-2 py-0.5 font-mono text-[10px] font-black uppercase ${statusStyle[status] ?? "bg-white text-gray-700"}`}
          >
            {status}
          </span>
          {onDelete &&
            (confirming ? (
              <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    onDelete()
                  }}
                  className="border-2 border-black bg-red-600 px-1.5 py-0.5 font-mono text-[10px] font-black uppercase text-white hover:bg-red-700"
                >
                  Delete
                </button>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    setConfirming(false)
                  }}
                  className="border-2 border-black bg-white px-1.5 py-0.5 font-mono text-[10px] font-black uppercase text-gray-700 hover:bg-[#F3F4F6]"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <button
                type="button"
                title="Delete this newsletter"
                onClick={(e) => {
                  e.stopPropagation()
                  setConfirming(true)
                }}
                className="flex size-6 items-center justify-center border-2 border-black bg-white text-gray-500 hover:bg-red-50 hover:text-red-600"
              >
                <Trash2 className="size-3.5" />
              </button>
            ))}
        </div>
      </div>
      <p className="font-display mt-3 text-base font-black uppercase tracking-tight text-[#1A1A1A]">{title}</p>
      <p className="text-xs font-bold uppercase text-gray-500">Updated {updatedAt}</p>
      <p className="mt-3 truncate text-sm font-medium text-gray-600" title={sourceFile}>
        {sourceFile}
      </p>
      {rerunNote && <p className="mt-1 text-xs font-medium text-gray-500">{rerunNote}</p>}
    </div>
  )
}
