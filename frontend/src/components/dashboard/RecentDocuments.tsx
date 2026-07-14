import { DocumentCard, type DocumentCardProps } from "@/components/dashboard/DocumentCard"

const placeholderDocuments: DocumentCardProps[] = [
  { title: "Q3 Product Launch PRD", updatedAt: "2 days ago", status: "Ready" },
  { title: "Mobile Onboarding Revamp", updatedAt: "5 days ago", status: "Draft" },
  { title: "API Platform v2 PRD", updatedAt: "2 weeks ago", status: "Archived" },
]

export function RecentDocuments() {
  return (
    <section className="w-full max-w-5xl">
      <h2 className="mb-4 text-lg font-semibold text-foreground">
        Recent Documents
      </h2>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {placeholderDocuments.map((doc) => (
          <DocumentCard key={doc.title} {...doc} />
        ))}
      </div>
    </section>
  )
}
