/**
 * Focused Check 3 regression harness. It deliberately calls only the
 * verifier; no PDF extraction, Writer generation, or full pipeline work.
 *
 * Usage: npx tsx scripts/testVerifier.ts
 */
import fs from "node:fs"
import path from "node:path"
import type { NewsletterFeatureItem } from "../src/newsletter/types"
import type { NewsletterJson } from "../src/writer/newsletterOutput.schema"
import { checkUngroundedClaims, type DocumentContext } from "../src/verifier/newsletterVerifier"

interface Fixture {
  itemsHeading: string
  documentContext: DocumentContext
  sourceItems: NewsletterFeatureItem[]
  newsletter: NewsletterJson
}

function loadFixture(filename: string): Fixture {
  const fixturePath = path.join(__dirname, "..", "test-fixtures", filename)
  return JSON.parse(fs.readFileSync(fixturePath, "utf-8")) as Fixture
}

async function run(name: string, filename: string) {
  const fixture = loadFixture(filename)
  const result = await checkUngroundedClaims(
    fixture.newsletter,
    fixture.sourceItems,
    fixture.itemsHeading,
    fixture.documentContext,
  )
  console.log(`\n${name}`)
  console.log(JSON.stringify(result, null, 2))
  return result
}

async function main() {
  const planted = await run("planted fabrication", "verifier-planted-fabrication.json")
  if (planted.error) throw new Error(`Planted fabrication Check 3 failed: ${planted.error}`)
  if (!planted.ungroundedClaims.some(({ claim }) => /\bCOD\b|cash on delivery/i.test(claim))) {
    throw new Error("Planted COD fabrication was not detected")
  }

  const paraphrase = await run("grounded paraphrase", "verifier-grounded-paraphrase.json")
  if (paraphrase.error) throw new Error(`Grounded paraphrase Check 3 failed: ${paraphrase.error}`)
  console.log(`\nGrounded-paraphrase flags: ${paraphrase.ungroundedClaims.length}`)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
