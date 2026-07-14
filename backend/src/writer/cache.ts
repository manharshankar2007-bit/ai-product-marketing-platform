import type { NewsletterType } from "../newsletter/types"
import { loadExamplesForType } from "./exampleLoader"
import { loadStyleGuide } from "./styleLoader"
import type { LoadedExample, LoadedStyleGuide } from "./types"

let styleGuideCache: LoadedStyleGuide | null = null
const examplesCache = new Map<NewsletterType, LoadedExample[]>()

/**
 * Returns the cached style guide, loading it from disk on first call only.
 */
export function getStyleGuide(): LoadedStyleGuide {
  if (!styleGuideCache) {
    styleGuideCache = loadStyleGuide()
  }
  return styleGuideCache
}

/**
 * Returns the cached examples for a given newsletter type, loading them
 * from disk on first call for that type only.
 */
export function getExamples(newsletterType: NewsletterType): LoadedExample[] {
  const cached = examplesCache.get(newsletterType)
  if (cached) {
    return cached
  }

  const loaded = loadExamplesForType(newsletterType)
  examplesCache.set(newsletterType, loaded)
  return loaded
}

/**
 * Clears the in-memory cache so the next getStyleGuide()/getExamples()
 * call re-reads from disk. Intended for development (editing the style
 * guide or example files without restarting the process).
 */
export function reload(): void {
  styleGuideCache = null
  examplesCache.clear()
}
