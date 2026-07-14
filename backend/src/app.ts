import express from "express"
import cors from "cors"
import helmet from "helmet"
import { env } from "./config/env"
import { requestLogger } from "./middleware/logger"
import { errorHandler } from "./middleware/errorHandler"
import routes from "./routes"

const app = express()

app.use(helmet())
app.use(cors({ origin: env.corsOrigin }))
app.use(requestLogger)
app.use(express.json())

app.use("/api", routes)

app.use(errorHandler)

export default app
