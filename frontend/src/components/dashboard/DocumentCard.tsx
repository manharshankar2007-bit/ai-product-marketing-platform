import { FileText } from "lucide-react"
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"

export interface DocumentCardProps {
  title: string
  updatedAt: string
  status: "Draft" | "Ready" | "Archived"
}

const statusVariant: Record<DocumentCardProps["status"], "secondary" | "default" | "outline"> = {
  Draft: "secondary",
  Ready: "default",
  Archived: "outline",
}

export function DocumentCard({ title, updatedAt, status }: DocumentCardProps) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-2">
          <div className="flex size-9 items-center justify-center rounded-md bg-muted">
            <FileText className="size-4 text-muted-foreground" />
          </div>
          <Badge variant={statusVariant[status]}>{status}</Badge>
        </div>
        <CardTitle className="pt-2">{title}</CardTitle>
        <CardDescription>Updated {updatedAt}</CardDescription>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground">
          Newsletter draft generated from this PRD.
        </p>
      </CardContent>
    </Card>
  )
}
