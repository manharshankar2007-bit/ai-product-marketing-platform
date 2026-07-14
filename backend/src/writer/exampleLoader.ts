import fs from "node:fs"
import path from "node:path"
import type { NewsletterType } from "../newsletter/types"
import { hashContent } from "./styleLoader"
import { WriterEngineFileNotFoundError, type LoadedExample } from "./types"

// docs/examples/ lives outside the backend package, at the repo root
// (sibling of backend/ and frontend/). This path is fixed relative to
// this file's own location on disk — backend/src/writer -> up 3 -> repo
// root -> docs/examples — which resolves identically whether this file
// is run from src/ (dev, tsx) or dist/ (prod, node), since both sit at
// the same depth under the repo root.
const EXAMPLES_DIR = path.resolve(__dirname, "../../../docs/examples")

/**
 * NOTE: the original spec for this loader named "rider-tags-example.md"
 * as the second What's New example. That file was never supplied and
 * does not exist anywhere in this project (confirmed while writing
 * newsletterStyle.md). "rider-active-task-webhook-example.md" — a second
 * real, approved What's New newsletter that *was* supplied — is used in
 * its place, exactly as documented in newsletterStyle.md's source-material
 * note. If "rider-tags-example.md" is supplied later, update this map.
 */
const EXAMPLE_FILES_BY_TYPE: Record<NewsletterType, readonly string[]> = {
  whats_new: ["whats-new-example.md", "rider-active-task-webhook-example.md"],
  coming_soon: ["coming-soon-example.md"],
  mixed: ["whats-new-example.md", "rider-active-task-webhook-example.md", "coming-soon-example.md"],
}

function loadExampleFile(filename: string): LoadedExample {
  const filePath = path.join(EXAMPLES_DIR, filename)

  if (!fs.existsSync(filePath)) {
    throw new WriterEngineFileNotFoundError(`Example newsletter not found: ${filePath}`)
  }

  const content = fs.readFileSync(filePath, "utf-8")

  return { filename, content, version: hashContent(content) }
}

/**
 * Loads only the example newsletters relevant to the given newsletter
 * type — never loads all three unless newsletterType is "mixed".
 */
export function loadExamplesForType(newsletterType: NewsletterType): LoadedExample[] {
  return EXAMPLE_FILES_BY_TYPE[newsletterType].map(loadExampleFile)
}
