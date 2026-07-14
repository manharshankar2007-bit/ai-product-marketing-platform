import { useRef, useState, type DragEvent } from "react"
import { FileText, UploadCloud } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { cn } from "@/lib/utils"

export function UploadCard() {
  const [isDragging, setIsDragging] = useState(false)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const acceptFile = (file: File | undefined) => {
    if (file && file.type === "application/pdf") {
      setSelectedFile(file)
    }
  }

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    setIsDragging(false)
    acceptFile(event.dataTransfer.files[0])
  }

  return (
    <Card className="w-full max-w-2xl">
      <CardHeader>
        <CardTitle>Upload a PRD</CardTitle>
        <CardDescription>
          Drop a PDF here, or click to browse your files.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div
          role="button"
          tabIndex={0}
          onClick={() => inputRef.current?.click()}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              inputRef.current?.click()
            }
          }}
          onDragOver={(event) => {
            event.preventDefault()
            setIsDragging(true)
          }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleDrop}
          className={cn(
            "flex flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed px-6 py-14 text-center transition-colors cursor-pointer",
            isDragging
              ? "border-primary bg-primary/5"
              : "border-border hover:border-primary/50 hover:bg-muted/40"
          )}
        >
          <input
            ref={inputRef}
            type="file"
            accept="application/pdf"
            className="hidden"
            onChange={(event) => acceptFile(event.target.files?.[0])}
          />

          {selectedFile ? (
            <>
              <FileText className="size-10 text-primary" />
              <div className="space-y-1">
                <p className="text-sm font-medium text-foreground">
                  {selectedFile.name}
                </p>
                <p className="text-xs text-muted-foreground">
                  Ready to upload &middot; click or drop to replace
                </p>
              </div>
            </>
          ) : (
            <>
              <UploadCloud className="size-10 text-muted-foreground" />
              <div className="space-y-1">
                <p className="text-sm font-medium text-foreground">
                  Drag &amp; drop your PDF here
                </p>
                <p className="text-xs text-muted-foreground">
                  or click to upload &middot; PDF only
                </p>
              </div>
            </>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
