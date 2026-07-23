import { prisma } from "./prismaClient"
import type { NewsletterJson } from "../writer/newsletterOutput.schema"
import type { VerificationReport } from "../verifier/newsletterVerifier"

export interface StoredNewslettersContent {
  whatsNew: NewsletterJson | null
  comingSoon: NewsletterJson | null
}

export interface StoredNewslettersVerification {
  whatsNew: VerificationReport | null
  comingSoon: VerificationReport | null
}

export interface SaveNewsletterInput {
  sourceFile: string
  documentTitle: string | null
  whatsNew: NewsletterJson | null
  comingSoon: NewsletterJson | null
  whatsNewVerification: VerificationReport | null
  comingSoonVerification: VerificationReport | null
}

function computeNewsletterType(hasWhatsNew: boolean, hasComingSoon: boolean): "whatsNew" | "comingSoon" | "mixed" {
  if (hasWhatsNew && hasComingSoon) return "mixed"
  return hasWhatsNew ? "whatsNew" : "comingSoon"
}

/**
 * Persists a successfully generated newsletter. CRITICAL: never throws.
 * Persistence is additive/optional — a broken, missing, or unreachable
 * database must never fail a generation that already succeeded, so every
 * failure mode here is caught and only logged as a warning. Callers should
 * not wrap this in their own try/catch; it always resolves.
 *
 * De-dupe policy — deliberately the simple version, not a smarter merge:
 * re-running the same source file is NOT collapsed into the existing row
 * or updated in place. Both runs are kept as separate rows; the newer one
 * naturally sorts first (see listNewsletters' ordering), and the list
 * marks any file with more than one saved run so it reads as "a re-run,"
 * not a silent duplicate. No attempt is made to detect near-duplicate
 * content or offer an update-vs-new-version choice — flagging that
 * explicitly as the simpler of the two options described, not the
 * smarter one.
 */
export async function saveNewsletter(input: SaveNewsletterInput): Promise<void> {
  try {
    const newsletterType = computeNewsletterType(input.whatsNew !== null, input.comingSoon !== null)

    const content: StoredNewslettersContent = { whatsNew: input.whatsNew, comingSoon: input.comingSoon }
    const verification: StoredNewslettersVerification = {
      whatsNew: input.whatsNewVerification,
      comingSoon: input.comingSoonVerification,
    }

    const priorRunCount = await prisma.newsletter.count({ where: { sourceFile: input.sourceFile } })
    if (priorRunCount > 0) {
      console.log(
        `[newsletterHistory] "${input.sourceFile}" has been run before (${priorRunCount} prior version(s)) — saving as a new run, not overwriting.`,
      )
    }

    await prisma.newsletter.create({
      data: {
        sourceFile: input.sourceFile,
        documentTitle: input.documentTitle,
        newsletterType,
        contentJson: JSON.stringify(content),
        verification: JSON.stringify(verification),
      },
    })
  } catch (error) {
    console.warn(
      "[newsletterHistory] Failed to save newsletter — continuing without persistence:",
      error instanceof Error ? error.message : error,
    )
  }
}

export interface NewsletterListItem {
  id: string
  sourceFile: string
  documentTitle: string | null
  newsletterType: string
  createdAt: Date
  /** True when other saved runs share this exact sourceFile — a re-run, not a fresh document. */
  isRerun: boolean
  /** Total number of saved runs (including this one) sharing this sourceFile. 1 for a one-off. */
  totalRunsForFile: number
}

/**
 * The list is the primary surface for a multi-PRD library, not just a
 * history log — every saved run, newest first, with enough on each row
 * (source filename, title, type, date) to find past work without opening
 * it. Not wrapped in try/catch — a broken DB here is a real error for an
 * endpoint whose only job is reading the DB; it surfaces normally via the
 * caller's error handling.
 *
 * isRerun/totalRunsForFile are computed in application code (a simple
 * group-by-count over already-fetched rows), not a SQL window function —
 * there's no scale here that would need one, and Prisma's simple query API
 * doesn't have a trivial PARTITION BY equivalent for SQLite.
 */
export async function listNewsletters(): Promise<NewsletterListItem[]> {
  const rows = await prisma.newsletter.findMany({
    orderBy: { createdAt: "desc" },
    select: { id: true, sourceFile: true, documentTitle: true, newsletterType: true, createdAt: true },
  })

  const countsBySourceFile = new Map<string, number>()
  for (const row of rows) {
    countsBySourceFile.set(row.sourceFile, (countsBySourceFile.get(row.sourceFile) ?? 0) + 1)
  }

  return rows.map((row) => {
    const totalRunsForFile = countsBySourceFile.get(row.sourceFile) ?? 1
    return { ...row, isRerun: totalRunsForFile > 1, totalRunsForFile }
  })
}

export interface NewsletterDetail {
  id: string
  sourceFile: string
  documentTitle: string | null
  newsletterType: string
  createdAt: Date
  content: StoredNewslettersContent
  verification: StoredNewslettersVerification
}

/** Returns false (not an error) if the id was already gone — deleting a newsletter that no longer exists isn't a failure worth surfacing differently from a successful delete. */
export async function deleteNewsletter(id: string): Promise<boolean> {
  try {
    await prisma.newsletter.delete({ where: { id } })
    return true
  } catch {
    return false
  }
}

export async function getNewsletterById(id: string): Promise<NewsletterDetail | null> {
  const row = await prisma.newsletter.findUnique({ where: { id } })
  if (!row) return null

  return {
    id: row.id,
    sourceFile: row.sourceFile,
    documentTitle: row.documentTitle,
    newsletterType: row.newsletterType,
    createdAt: row.createdAt,
    content: JSON.parse(row.contentJson) as StoredNewslettersContent,
    verification: row.verification
      ? (JSON.parse(row.verification) as StoredNewslettersVerification)
      : { whatsNew: null, comingSoon: null },
  }
}
