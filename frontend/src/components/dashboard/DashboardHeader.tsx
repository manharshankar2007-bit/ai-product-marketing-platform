import { Sparkles } from "lucide-react"

export function DashboardHeader() {
  return (
    <header className="flex flex-col items-center gap-3 py-12 text-center">
      <div className="flex items-center gap-2 border-2 border-black bg-[#E0FF00] px-3 py-1 shadow-[3px_3px_0px_0px_rgba(0,0,0,1)]">
        <Sparkles className="size-3.5 text-[#1A1A1A]" />
        <span className="font-mono text-[11px] font-black uppercase tracking-wide text-[#1A1A1A]">
          Pidge &middot; PRD to Newsletter
        </span>
      </div>
      <h1 className="font-display text-3xl font-black uppercase tracking-tight text-[#1A1A1A] sm:text-4xl">
        AI Product Marketing Platform
      </h1>
      <p className="max-w-xl text-base font-medium text-gray-600">
        Generate high-quality product newsletters from PRDs.
      </p>
    </header>
  )
}
