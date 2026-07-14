import { DashboardHeader } from "@/components/dashboard/DashboardHeader"
import { UploadCard } from "@/components/dashboard/UploadCard"
import { RecentDocuments } from "@/components/dashboard/RecentDocuments"

function App() {
  return (
    <div className="min-h-svh bg-background">
      <main className="mx-auto flex max-w-5xl flex-col items-center gap-12 px-6 pb-20">
        <DashboardHeader />
        <UploadCard />
        <RecentDocuments />
      </main>
    </div>
  )
}

export default App
