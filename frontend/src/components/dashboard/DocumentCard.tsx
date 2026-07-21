import { FileText } from "lucide-react"
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"

export interface DocumentCardProps {
  title: string
  updatedAt: string
  /** A short label — e.g. a lifecycle status ("Draft"/"Ready"/"Archived") or a newsletter type ("What's New"/"Mixed"). Anything else falls back to the neutral "outline" badge. */
  status: string
  sourceFile: string
  /** Set when other saved runs share this exact sourceFile — shown as a quiet note, not a warning; re-running a PRD is normal library usage, not an error. */
  rerunNote?: string
}

const statusVariant: Record<string, "secondary" | "default" | "outline"> = {
  Draft: "secondary",
  Ready: "default",
  Archived: "outline",
}

export function DocumentCard({ title, updatedAt, status, sourceFile, rerunNote }: DocumentCardProps) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-2">
          <div className="flex size-9 items-center justify-center rounded-md bg-muted">
            <FileText className="size-4 text-muted-foreground" />
          </div>
          <Badge variant={statusVariant[status] ?? "outline"}>{status}</Badge>
        </div>
        <CardTitle className="pt-2">{title}</CardTitle>
        <CardDescription>Updated {updatedAt}</CardDescription>
      </CardHeader>
      <CardContent>
        <p className="truncate text-sm text-muted-foreground" title={sourceFile}>
          {sourceFile}
        </p>
        {rerunNote && <p className="mt-1 text-xs text-muted-foreground">{rerunNote}</p>}
      </CardContent>
    </Card>
  )
}
