import { Router } from "express"
import healthRoutes from "./health.routes"
import documentRoutes from "./document.routes"

const router = Router()

router.use(healthRoutes)
router.use(documentRoutes)

export default router
