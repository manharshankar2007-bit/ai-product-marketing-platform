import { Router } from "express"
import { uploadPdf } from "../middleware/upload"
import { uploadDocument } from "../controllers/document.controller"

const router = Router()

router.post("/documents/upload", uploadPdf, uploadDocument)

export default router
