import { z } from "zod"
import { FeatureExtractionSchema } from "./schemas/featureExtraction.schema"
import { ModelNewsletterJsonSchema } from "../writer/newsletterOutput.schema"

/**
 * Ollama-only. JSON Schema versions of our Zod schemas, passed as the
 * native /api/chat endpoint's `format` field to constrain generation at the
 * token level — the model literally cannot emit a token that would violate
 * the schema. This is not a prompt suggestion the way Groq's
 * response_format: json_object is; it's a real generation constraint. The
 * Groq path never sees these — it already gets response_format json_object
 * unchanged, this is additive Ollama-specific hardening only.
 *
 * { io: "input" } because FeatureExtractionSchema's releasePlan field uses
 * .transform() (null -> []), which z.toJSONSchema can't represent in
 * "output" mode ("Transforms cannot be represented in JSON Schema") —
 * "input" mode uses the pre-transform shape, which is exactly what the
 * model needs to produce; the transform itself still runs after parsing,
 * in code, same as always.
 */
export const FEATURE_EXTRACTION_JSON_SCHEMA = z.toJSONSchema(FeatureExtractionSchema, { io: "input" })
export const MODEL_NEWSLETTER_JSON_SCHEMA = z.toJSONSchema(ModelNewsletterJsonSchema, { io: "input" })
