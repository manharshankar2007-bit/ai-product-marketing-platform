import { PrismaClient } from "../generated/prisma/client"
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3"
import { env } from "../config/env"

// Persistence is additive/optional — see newsletterHistory.ts, which wraps
// every operation on this client in try/catch so a broken or missing
// database can never fail a pipeline run that already succeeded.
const adapter = new PrismaBetterSqlite3({ url: env.databaseUrl })

export const prisma = new PrismaClient({ adapter })
