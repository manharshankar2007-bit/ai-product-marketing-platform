import fs from "node:fs"
import path from "node:path"

/**
 * Pure observation, zero side effects on the pipeline it watches. Every
 * `record()` call is additive instrumentation dropped in AROUND an
 * already-existing operation — it reads values that operation already
 * produced (or the error it already threw) and writes them down; it never
 * changes what that operation returns, throws, or how it behaves. Nothing
 * here can fail the actual request: file-write errors are swallowed after
 * being logged to the console, never propagated.
 */

const DEBUG_DIR = path.join(__dirname, "..", "..", "debug")
const DEBUG_FILE = path.join(DEBUG_DIR, "pipeline-debug.json")

const SAMPLE_TRUNCATE_CHARS = 300

export interface StageRecord {
  stage: string
  unit: string
  startedAt: string
  endedAt: string
  durationMs: number
  inputCount: number
  outputCount: number
  firstSample: string | null
  errors: string[]
  validationFailures: string[]
  droppedData: boolean
}

/**
 * The canonical order this pipeline's stages run in, and the unit each
 * one's input/output counts are measured in. Some stages run once per
 * document (PDF Extraction, Text Cleaning, Chunking, Newsletter Builder);
 * others run once per chunk (LLM Request through Zod Validation, in the
 * chunked path) or once per newsletter type (Writer) — the summary sums
 * every recorded entry for a stage name, so both shapes fall out of the
 * same aggregation.
 */
const STAGE_ORDER: { stage: string; unit: string }[] = [
  { stage: "PDF Extraction", unit: "document(s)" },
  { stage: "Text Cleaning", unit: "chars" },
  { stage: "Chunking", unit: "chunk(s)" },
  { stage: "LLM Request", unit: "call(s)" },
  { stage: "Raw LLM Response", unit: "response(s)" },
  { stage: "JSON Parsing", unit: "feature(s)" },
  { stage: "Defaults Fill", unit: "feature(s)" },
  { stage: "Status Normalization", unit: "feature(s)" },
  { stage: "Zod Validation", unit: "feature(s)" },
  { stage: "Merge", unit: "feature(s)" },
  { stage: "Newsletter Builder", unit: "feature(s)" },
  { stage: "Writer", unit: "newsletter(s)" },
]

function truncateSample(value: unknown): string | null {
  if (value === undefined) return null
  let text: string
  try {
    text = typeof value === "string" ? value : JSON.stringify(value)
  } catch {
    return null
  }
  if (text === undefined) return null
  return text.length > SAMPLE_TRUNCATE_CHARS ? text.slice(0, SAMPLE_TRUNCATE_CHARS) + "…" : text
}

class PipelineDebugger {
  private records: StageRecord[] = []
  private runId: string | null = null

  /** Call once at the start of a pipeline run (e.g. the top of the upload handler). */
  startRun(runId: string): void {
    this.records = []
    this.runId = runId
  }

  record(params: {
    stage: string
    startedAt: number
    endedAt: number
    inputCount: number
    outputCount: number
    firstSample?: unknown
    errors?: string[]
    validationFailures?: string[]
  }): void {
    const known = STAGE_ORDER.find((s) => s.stage === params.stage)
    const record: StageRecord = {
      stage: params.stage,
      unit: known?.unit ?? "item(s)",
      startedAt: new Date(params.startedAt).toISOString(),
      endedAt: new Date(params.endedAt).toISOString(),
      durationMs: params.endedAt - params.startedAt,
      inputCount: params.inputCount,
      outputCount: params.outputCount,
      firstSample: truncateSample(params.firstSample),
      errors: params.errors ?? [],
      validationFailures: params.validationFailures ?? [],
      droppedData: params.outputCount < params.inputCount,
    }
    this.records.push(record)
  }

  /**
   * Writes backend/debug/pipeline-debug.json and prints the console
   * summary. Safe to call even after a mid-pipeline failure — whatever
   * stages recorded before the crash are still written out, which is
   * exactly the case this instrumentation exists to make visible.
   */
  finalize(): void {
    const summary = this.buildSummary()

    try {
      fs.mkdirSync(DEBUG_DIR, { recursive: true })
      fs.writeFileSync(
        DEBUG_FILE,
        JSON.stringify(
          {
            runId: this.runId,
            generatedAt: new Date().toISOString(),
            stages: this.records,
            summary: summary.lines,
            firstZeroOrDropStage: summary.firstZeroOrDropStage,
          },
          null,
          2,
        ),
      )
    } catch (error) {
      console.error("[pipelineDebugger] failed to write pipeline-debug.json:", error)
    }

    console.log("\n=== PIPELINE DEBUG SUMMARY ===")
    for (const line of summary.lines) console.log(line)
    if (summary.firstZeroOrDropStage) {
      console.log(`\n⚠ First stage where the count hit zero or dropped: "${summary.firstZeroOrDropStage}"`)
    }
    console.log(`Full detail written to ${DEBUG_FILE}\n`)
  }

  private buildSummary(): { lines: string[]; firstZeroOrDropStage: string | null } {
    const NAME_COLUMN_WIDTH = 24
    const lines: string[] = []
    let firstZeroOrDropStage: string | null = null
    let previousStageHadOutput = false
    let sawAnyPriorStage = false

    for (const { stage, unit } of STAGE_ORDER) {
      const entries = this.records.filter((r) => r.stage === stage)

      if (entries.length === 0) {
        lines.push(`${stage} ${".".repeat(Math.max(1, NAME_COLUMN_WIDTH - stage.length))} skipped`)
        continue
      }

      const totalOutput = entries.reduce((sum, e) => sum + e.outputCount, 0)
      const hadErrors = entries.some((e) => e.errors.length > 0 || e.validationFailures.length > 0)
      const isZeroOrDrop = totalOutput === 0 && sawAnyPriorStage && previousStageHadOutput

      if (isZeroOrDrop && firstZeroOrDropStage === null) {
        firstZeroOrDropStage = stage
      }

      const flag = isZeroOrDrop ? " ❌" : hadErrors ? " ⚠" : ""
      const dots = ".".repeat(Math.max(1, NAME_COLUMN_WIDTH - stage.length))
      lines.push(`${stage} ${dots} ${totalOutput} ${unit}${flag}`)

      previousStageHadOutput = totalOutput > 0
      sawAnyPriorStage = true
    }

    return { lines, firstZeroOrDropStage }
  }
}

export const pipelineDebugger = new PipelineDebugger()

/** Shared duck-typed accessor: every stage in this pipeline passes around either a FeatureExtraction-shaped object or an array of features. */
export function extractFeaturesArray(value: unknown): unknown[] {
  if (Array.isArray(value)) return value
  if (typeof value === "object" && value !== null && Array.isArray((value as Record<string, unknown>).features)) {
    return (value as Record<string, unknown>).features as unknown[]
  }
  return []
}

