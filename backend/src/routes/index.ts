import { Router } from "express"
import healthRoutes from "./health.routes"
import documentRoutes from "./document.routes"
import newsletterHistoryRoutes from "./newsletterHistory.routes"

const router = Router()

router.use(healthRoutes)
router.use(documentRoutes)
router.use(newsletterHistoryRoutes)

export default router
