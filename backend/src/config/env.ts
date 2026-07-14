import path from "node:path"
import dotenv from "dotenv"

dotenv.config({ quiet: true })

export const env = {
  port: Number(process.env.PORT) || 4000,
  nodeEnv: process.env.NODE_ENV || "development",
  corsOrigin: process.env.CORS_ORIGIN || "http://localhost:5173",
  uploadDir: path.resolve(process.cwd(), process.env.UPLOAD_DIR || "uploads"),
  maxUploadSizeBytes: 20 * 1024 * 1024,
  groqApiKey: process.env.GROQ_API_KEY || "",
  groqModel: process.env.GROQ_MODEL || "llama-3.3-70b-versatile",
  // Approximate context window (in tokens) of the configured model. This is
  // intentionally configurable rather than looked up from a hardcoded
  // model-name table, since GROQ_MODEL can be changed at any time.
  groqContextWindowTokens: Number(process.env.GROQ_CONTEXT_WINDOW_TOKENS) || 128_000,
  // Tokens reserved for the model's JSON response; subtracted from the
  // context window when checking whether the input document fits.
  groqMaxOutputTokens: Number(process.env.GROQ_MAX_OUTPUT_TOKENS) || 8_000,
}
