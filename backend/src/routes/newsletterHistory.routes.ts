import { Router } from "express"
import { getNewsletterList, getNewsletterDetail, deleteNewsletterHandler } from "../controllers/newsletterHistory.controller"

const router = Router()

router.get("/newsletters", getNewsletterList)
router.get("/newsletters/:id", getNewsletterDetail)
router.delete("/newsletters/:id", deleteNewsletterHandler)

export default router
