import fs from "node:fs"
import path from "node:path"
import { createHash } from "node:crypto"
import { WriterEngineFileNotFoundError, type LoadedStyleGuide } from "./types"

// Mirrors backend/src/writer/ -> backend/src/style/newsletterStyle.md in
// dev (tsx running .ts directly) and backend/dist/writer/ ->
// backend/dist/style/newsletterStyle.md in prod, since the build script
// copies style/*.md alongside the compiled output (see package.json).
const STYLE_GUIDE_PATH = path.resolve(__dirname, "../style/newsletterStyle.md")

export function hashContent(content: string): string {
  return createHash("sha256").update(content).digest("hex").slice(0, 12)
}

/**
 * Reads the style guide from disk. Never hardcodes its contents — this
 * function is the only place that knows the file path; everything else
 * consumes `LoadedStyleGuide.content`.
 */
export function loadStyleGuide(): LoadedStyleGuide {
  if (!fs.existsSync(STYLE_GUIDE_PATH)) {
    throw new WriterEngineFileNotFoundError(`Style guide not found at ${STYLE_GUIDE_PATH}`)
  }

  const content = fs.readFileSync(STYLE_GUIDE_PATH, "utf-8")

  return { content, version: hashContent(content) }
}
