/**
 * Standalone Writer test harness.
 *
 * Runs ONLY the Writer against a saved, fixed extraction fixture — no PDF,
 * no extraction, no chunking. The fixture is held constant deliberately:
 * the Writer is nondeterministic, so its input must not also vary between
 * runs, or a change in output can't be attributed to the prompt change
 * being tested versus a different input.
 *
 * Usage:
 *   npx tsx scripts/testWriter.ts
 *   npx tsx scripts/testWriter.ts path/to/other-fixture.json
 */
import fs from "node:fs"
import path from "node:path"
import { buildNewsletter } from "../src/newsletter/builder"
import type { NewsletterBuilderOutput } from "../src/newsletter/types"
import { FeatureExtractionSchema } from "../src/ai/schemas/featureExtraction.schema"
import { prepareWriterPrompt } from "../src/writer/writerEngine"
import { WriterProvider } from "../src/writer/writerProvider"

const DEFAULT_FIXTURE_PATH = path.join(__dirname, "..", "test-fixtures", "writer-extraction-fixture.json")

/** Mirrors document.controller.ts's own slicing — duplicated here deliberately so this harness never depends on controller internals. */
function sliceForWhatsNew(builderOutput: NewsletterBuilderOutput): NewsletterBuilderOutput {
  return { ...builderOutput, newsletterType: "whats_new", comingSoon: [] }
}

function sliceForComingSoon(builderOutput: NewsletterBuilderOutput): NewsletterBuilderOutput {
  return {
    ...builderOutput,
    newsletterType: "coming_soon",
    whatsNew: [],
    unclassified: [],
    uiChanges: [],
    enhancements: [],
    bugFixes: [],
    knownLimitations: [],
  }
}

async function main() {
  const fixturePath = process.argv[2] ?? DEFAULT_FIXTURE_PATH
  const raw = JSON.parse(fs.readFileSync(fixturePath, "utf-8"))
  const validation = FeatureExtractionSchema.safeParse(raw)
  if (!validation.success) {
    console.error("Fixture failed schema validation:", validation.error.issues)
    process.exit(1)
  }
  const featureExtraction = validation.data

  console.log(`Fixture: ${fixturePath}`)
  console.log(`Feature count: ${featureExtraction.features.length}`)

  const builderOutput = buildNewsletter(featureExtraction)
  const writerProvider = new WriterProvider()

  if (builderOutput.whatsNew.length > 0) {
    console.log(`\n=== WHAT'S NEW (${builderOutput.whatsNew.length} features) ===`)
    const result = await writerProvider.generateNewsletter(prepareWriterPrompt(sliceForWhatsNew(builderOutput)))
    console.log(result.newsletter)
    console.log("\n--- metadata ---")
    console.log(JSON.stringify(result.metadata, null, 2))
  }

  if (builderOutput.comingSoon.length > 0) {
    console.log(`\n=== COMING SOON (${builderOutput.comingSoon.length} features) ===`)
    const result = await writerProvider.generateNewsletter(prepareWriterPrompt(sliceForComingSoon(builderOutput)))
    console.log(result.newsletter)
    console.log("\n--- metadata ---")
    console.log(JSON.stringify(result.metadata, null, 2))
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
