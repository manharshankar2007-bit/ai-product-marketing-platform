import type { NewsletterJson } from "./api"

/**
 * Inline styles only — not a <style> block, not Tailwind classes. Email
 * clients and paste-into-compose-box flows routinely strip <style> tags;
 * inline `style="..."` attributes are the only formatting that reliably
 * survives both a standalone file open AND a rich paste into Gmail/Outlook.
 */
const styles = {
  // Single-quoted font names deliberately — this string is embedded inside
  // a double-quoted style="..." HTML attribute; a literal " here would
  // terminate the attribute early and corrupt the tag.
  container:
    "max-width:600px;margin:0 auto;background-color:#ffffff;color:#171717;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;padding:24px;",
  title: "font-size:24px;line-height:1.35;font-weight:700;margin:0 0 16px 0;",
  paragraph: "margin:0 0 16px 0;line-height:1.6;",
  h2: "font-size:18px;font-weight:600;margin:24px 0 8px 0;",
  itemWrap: "margin:0 0 16px 0;",
  itemName: "font-weight:700;margin:0 0 4px 0;line-height:1.6;",
  itemBody: "margin:0;line-height:1.6;",
  ul: "margin:0 0 16px 0;padding-left:20px;line-height:1.6;",
  li: "margin-bottom:4px;",
  hr: "margin:16px 0;border:none;border-top:1px solid #e5e5e5;",
  sectionDivider: "margin:32px 0;border:none;border-top:3px solid #171717;",
  footerText: "font-size:14px;line-height:1.6;color:#525252;margin:0 0 2px 0;",
  link: "font-size:14px;font-weight:500;text-decoration:underline;color:#171717;",
}

function esc(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
}

export interface ExportSection {
  newsletter: NewsletterJson
  itemsHeading: string
}

/** The newsletter's own content only — no outer html/head/body wrapper. Used for both clipboard copy and embedding inside the standalone document. */
function renderNewsletterFragment(newsletter: NewsletterJson, itemsHeading: string): string {
  const parts: string[] = []

  parts.push(`<h1 style="${styles.title}">${esc(newsletter.title)}</h1>`)
  parts.push(`<p style="${styles.paragraph}">${esc(newsletter.intro)}</p>`)

  if (newsletter.whyBuilt) {
    parts.push(`<h2 style="${styles.h2}">Why We Built This</h2>`)
    parts.push(`<p style="${styles.paragraph}">${esc(newsletter.whyBuilt)}</p>`)
  }

  if (newsletter.navigation.length > 0) {
    parts.push(`<p style="${styles.paragraph}">You can find it in: ${esc(newsletter.navigation.join(" → "))}</p>`)
  }

  if (newsletter.items.length > 0) {
    parts.push(`<h2 style="${styles.h2}">${esc(itemsHeading)}</h2>`)
    for (const item of newsletter.items) {
      parts.push(
        `<div style="${styles.itemWrap}"><p style="${styles.itemName}">${esc(item.name)}</p><p style="${styles.itemBody}">${esc(item.body)}</p></div>`,
      )
    }
  }

  if (newsletter.meansToYou.length > 0) {
    parts.push(`<h2 style="${styles.h2}">What This Means To You</h2>`)
    parts.push(`<ul style="${styles.ul}">${newsletter.meansToYou.map((m) => `<li style="${styles.li}">${esc(m)}</li>`).join("")}</ul>`)
  }

  if (newsletter.whatsNext) {
    parts.push(`<h2 style="${styles.h2}">What's Next</h2>`)
    parts.push(`<p style="${styles.paragraph}">${esc(newsletter.whatsNext)}</p>`)
  }

  parts.push(`<hr style="${styles.hr}"/>`)
  parts.push(`<p style="${styles.footerText}">${esc(newsletter.footer.address)}</p>`)
  parts.push(`<p style="${styles.footerText}">${esc(newsletter.footer.city)}</p>`)
  parts.push(`<a href="${esc(newsletter.footer.websiteUrl)}" style="${styles.link}">VISIT WEBSITE</a>`)

  return parts.join("\n")
}

/** One or more sections stacked in one container, divided by a heavier rule when there's more than one — the "mixed" combined-export case. */
function renderContainerFragment(sections: ExportSection[]): string {
  const body = sections
    .map((section, index) => {
      const fragment = renderNewsletterFragment(section.newsletter, section.itemsHeading)
      return index === 0 ? fragment : `<hr style="${styles.sectionDivider}"/>\n${fragment}`
    })
    .join("\n")

  return `<div style="${styles.container}">\n${body}\n</div>`
}

/** Full standalone document — valid to open directly in a browser as a .html file. */
export function renderStandaloneDocument(sections: ExportSection[], documentTitle: string): string {
  return `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<title>${esc(documentTitle)}</title>
</head>
<body style="margin:0;padding:24px;background-color:#f5f5f5;">
${renderContainerFragment(sections)}
</body>
</html>
`
}

function renderPlainText(sections: ExportSection[]): string {
  return sections
    .map(({ newsletter: n, itemsHeading }) => {
      const lines: string[] = [n.title, "", n.intro]
      if (n.whyBuilt) lines.push("", "Why We Built This", n.whyBuilt)
      if (n.navigation.length > 0) lines.push("", `You can find it in: ${n.navigation.join(" → ")}`)
      if (n.items.length > 0) {
        lines.push("", itemsHeading)
        for (const item of n.items) lines.push("", item.name, item.body)
      }
      if (n.meansToYou.length > 0) {
        lines.push("", "What This Means To You")
        for (const m of n.meansToYou) lines.push(`- ${m}`)
      }
      if (n.whatsNext) lines.push("", "What's Next", n.whatsNext)
      lines.push("", n.footer.address, n.footer.city, n.footer.websiteUrl)
      return lines.join("\n")
    })
    .join("\n\n" + "=".repeat(40) + "\n\n")
}

/**
 * Copies the RENDERED (rich) HTML, not the HTML source as text — pasting
 * into Gmail/Outlook/Word should produce formatted content, not literal
 * "<h1 style=..." markup on the page. Falls back to plain text if the
 * browser doesn't support rich clipboard writes.
 */
export async function copyHtmlToClipboard(sections: ExportSection[]): Promise<void> {
  const html = renderContainerFragment(sections)
  const text = renderPlainText(sections)

  if (typeof ClipboardItem !== "undefined" && navigator.clipboard && "write" in navigator.clipboard) {
    await navigator.clipboard.write([
      new ClipboardItem({
        "text/html": new Blob([html], { type: "text/html" }),
        "text/plain": new Blob([text], { type: "text/plain" }),
      }),
    ])
    return
  }

  await navigator.clipboard.writeText(text)
}

export function downloadHtml(sections: ExportSection[], documentTitle: string, filename: string): void {
  const html = renderStandaloneDocument(sections, documentTitle)
  const blob = new Blob([html], { type: "text/html" })
  const url = URL.createObjectURL(blob)

  const link = document.createElement("a")
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}
