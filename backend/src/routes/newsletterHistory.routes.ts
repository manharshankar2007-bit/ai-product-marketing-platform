import { Router } from "express"
import { getNewsletterList, getNewsletterDetail } from "../controllers/newsletterHistory.controller"

const router = Router()

router.get("/newsletters", getNewsletterList)
router.get("/newsletters/:id", getNewsletterDetail)

export default router
