import { useRef, useState, type DragEvent } from "react"
import { FileText, Loader2, UploadCloud } from "lucide-react"
import { cn } from "@/lib/utils"
import { uploadDocument, type UploadSuccessResponse } from "@/lib/api"

type UploadPhase = "idle" | "uploading" | "processing" | "done" | "error"

interface UploadCardProps {
  onComplete: (result: UploadSuccessResponse) => void
  onError: (message: string) => void
}

export function UploadCard({ onComplete, onError }: UploadCardProps) {
  const [isDragging, setIsDragging] = useState(false)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [phase, setPhase] = useState<UploadPhase>("idle")
  const [uploadProgress, setUploadProgress] = useState(0)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const isBusy = phase === "uploading" || phase === "processing"

  const acceptFile = async (file: File | undefined) => {
    if (isBusy) return
    if (!file || file.type !== "application/pdf") return

    setSelectedFile(file)
    setErrorMessage(null)
    setUploadProgress(0)
    setPhase("uploading")

    try {
      const result = await uploadDocument(file, (percent) => {
        setUploadProgress(percent)
        if (percent >= 100) {
          setPhase("processing")
        }
      })
      setPhase("done")
      onComplete(result)
    } catch (error) {
      const message = error instanceof Error ? error.message : "Something went wrong during upload."
      setPhase("error")
      setErrorMessage(message)
      onError(message)
    }
  }

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    setIsDragging(false)
    void acceptFile(event.dataTransfer.files[0])
  }

  return (
    <div className="w-full max-w-2xl border-4 border-black bg-white shadow-[8px_8px_0px_0px_rgba(0,0,0,1)]">
      <div className="border-b-4 border-black px-6 py-4">
        <h2 className="font-display text-lg font-black uppercase tracking-tight text-[#1A1A1A]">Upload a PRD</h2>
        <p className="text-sm font-medium text-gray-600">Drop a PDF here, or click to browse your files.</p>
      </div>
      <div className="p-6">
        <div
          role="button"
          tabIndex={0}
          onClick={() => !isBusy && inputRef.current?.click()}
          onKeyDown={(event) => {
            if (!isBusy && (event.key === "Enter" || event.key === " ")) {
              inputRef.current?.click()
            }
          }}
          onDragOver={(event) => {
            event.preventDefault()
            if (!isBusy) setIsDragging(true)
          }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleDrop}
          className={cn(
            "flex flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed px-6 py-14 text-center transition-colors",
            isBusy ? "cursor-default" : "cursor-pointer",
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
            onChange={(event) => void acceptFile(event.target.files?.[0])}
          />

          {phase === "uploading" || phase === "processing" ? (
            <>
              <Loader2 className="size-10 animate-spin text-primary" />
              <div className="w-full max-w-xs space-y-2">
                <p className="text-sm font-medium text-foreground">{selectedFile?.name}</p>
                {phase === "uploading" ? (
                  <>
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full bg-primary transition-all"
                        style={{ width: `${uploadProgress}%` }}
                      />
                    </div>
                    <p className="text-xs text-muted-foreground">Uploading &middot; {uploadProgress}%</p>
                  </>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    Analyzing document and generating your newsletter &middot; this can take a minute
                  </p>
                )}
              </div>
            </>
          ) : phase === "error" ? (
            <>
              <FileText className="size-10 text-destructive" />
              <div className="space-y-1">
                <p className="text-sm font-medium text-foreground">{selectedFile?.name}</p>
                <p className="text-xs text-destructive">{errorMessage}</p>
                <p className="text-xs text-muted-foreground">Click or drop to try again</p>
              </div>
            </>
          ) : selectedFile ? (
            <>
              <FileText className="size-10 text-primary" />
              <div className="space-y-1">
                <p className="text-sm font-medium text-foreground">
                  {selectedFile.name}
                </p>
                <p className="text-xs text-muted-foreground">
                  Newsletter generated &middot; click or drop to replace
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
      </div>
    </div>
  )
}
