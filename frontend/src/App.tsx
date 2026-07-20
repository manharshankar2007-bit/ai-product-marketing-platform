import { useState } from "react"
import { DashboardHeader } from "@/components/dashboard/DashboardHeader"
import { UploadCard } from "@/components/dashboard/UploadCard"
import { NewsletterResult } from "@/components/dashboard/NewsletterResult"
import { RecentDocuments } from "@/components/dashboard/RecentDocuments"
import type { UploadSuccessResponse } from "@/lib/api"

function App() {
  const [result, setResult] = useState<UploadSuccessResponse | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  return (
    <div className="min-h-svh bg-background">
      <main className="mx-auto flex max-w-5xl flex-col items-center gap-12 px-6 pb-20">
        <DashboardHeader />
        <UploadCard
          onComplete={(uploadResult) => {
            setResult(uploadResult)
            setErrorMessage(null)
          }}
          onError={(message) => {
            setErrorMessage(message)
            setResult(null)
          }}
        />
        <NewsletterResult result={result} errorMessage={errorMessage} />
        <RecentDocuments />
      </main>
    </div>
  )
}

export default App
