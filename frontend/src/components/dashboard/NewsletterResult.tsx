import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import type { NewsletterSection, UploadSuccessResponse } from "@/lib/api"

/**
 * Plain, readable rendering of the structured newsletter JSON — white
 * background, dark text, system sans-serif, never monospace, regardless of
 * the surrounding app's own light/dark theme (a newsletter preview should
 * look like the artifact itself, not shift with the dashboard's theme).
 */
export function NewsletterBody({ newsletter, itemsHeading }: { newsletter: NewsletterSection["newsletter"]; itemsHeading: string }) {
  return (
    <div
      className="mx-auto w-full max-w-[600px] rounded-lg bg-white p-6 text-neutral-900"
      style={{ fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif" }}
    >
      <h1 className="mb-4 text-2xl font-bold leading-snug text-balance">{newsletter.title}</h1>

      <p className="mb-4 leading-relaxed [overflow-wrap:break-word]">{newsletter.intro}</p>

      {newsletter.whyBuilt && (
        <>
          <h2 className="mb-2 mt-6 text-lg font-semibold">Why We Built This</h2>
          <p className="mb-4 leading-relaxed [overflow-wrap:break-word]">{newsletter.whyBuilt}</p>
        </>
      )}

      {newsletter.navigation.length > 0 && (
        <p className="mb-4 leading-relaxed [overflow-wrap:break-word]">
          You can find it in: {newsletter.navigation.join(" → ")}
        </p>
      )}

      {newsletter.items.length > 0 && (
        <>
          <h2 className="mb-2 mt-6 text-lg font-semibold">{itemsHeading}</h2>
          {newsletter.items.map((item, index) => (
            <div key={index} className="mb-4">
              <p className="font-bold leading-relaxed">{item.name}</p>
              <p className="leading-relaxed [overflow-wrap:break-word]">{item.body}</p>
            </div>
          ))}
        </>
      )}

      {newsletter.meansToYou.length > 0 && (
        <>
          <h2 className="mb-2 mt-6 text-lg font-semibold">What This Means To You</h2>
          <ul className="mb-4 list-disc space-y-1 pl-5 leading-relaxed">
            {newsletter.meansToYou.map((point, index) => (
              <li key={index} className="[overflow-wrap:break-word]">
                {point}
              </li>
            ))}
          </ul>
        </>
      )}

      {newsletter.whatsNext && (
        <>
          <h2 className="mb-2 mt-6 text-lg font-semibold">What's Next</h2>
          <p className="mb-4 leading-relaxed [overflow-wrap:break-word]">{newsletter.whatsNext}</p>
        </>
      )}

      <hr className="my-4 border-neutral-200" />

      <p className="text-sm leading-relaxed text-neutral-600">{newsletter.footer.address}</p>
      <p className="text-sm leading-relaxed text-neutral-600">{newsletter.footer.city}</p>
      <a href={newsletter.footer.websiteUrl} className="text-sm font-medium underline">
        VISIT WEBSITE
      </a>
    </div>
  )
}

function NewsletterCard({ title, section }: { title: string; section: NewsletterSection }) {
  return (
    <Card className="w-full max-w-2xl">
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>generated in {(section.metadata.generationTimeMs / 1000).toFixed(1)}s</CardDescription>
      </CardHeader>
      <CardContent>
        <NewsletterBody newsletter={section.newsletter} itemsHeading={title} />
        {(section.metadata.possibleOmissions || section.metadata.missingSections.length > 0) && (
          <div className="mt-3 space-y-1 rounded-md border border-border bg-muted/30 p-3 text-xs text-muted-foreground">
            {section.metadata.possibleOmissions && (
              <p>Heads up: some extracted features may be missing from this draft &mdash; worth a quick review.</p>
            )}
            {section.metadata.missingSections.length > 0 && (
              <p>Missing expected sections: {section.metadata.missingSections.join(", ")}</p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

interface NewsletterResultProps {
  result: UploadSuccessResponse | null
  errorMessage: string | null
}

export function NewsletterResult({ result, errorMessage }: NewsletterResultProps) {
  if (!result && !errorMessage) return null

  if (errorMessage) {
    return (
      <Card className="w-full max-w-2xl">
        <CardHeader>
          <CardTitle>Upload Failed</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-destructive">{errorMessage}</p>
        </CardContent>
      </Card>
    )
  }

  const { whatsNew, comingSoon } = result!.newsletters

  return (
    <div className="flex w-full max-w-2xl flex-col gap-6">
      {whatsNew && <NewsletterCard title="What's New" section={whatsNew} />}
      {comingSoon && <NewsletterCard title="Coming Soon" section={comingSoon} />}
      {!whatsNew && !comingSoon && (
        <Card className="w-full max-w-2xl">
          <CardHeader>
            <CardTitle>No Newsletter Generated</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              No shipped, in-progress, or planned features were found in this document.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
