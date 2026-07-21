import type { NextFunction, Request, Response } from "express"
import { listNewsletters, getNewsletterById } from "../db/newsletterHistory"

export async function getNewsletterList(_req: Request, res: Response, next: NextFunction) {
  try {
    const newsletters = await listNewsletters()
    res.status(200).json({ success: true, newsletters })
  } catch (error) {
    next(error)
  }
}

export async function getNewsletterDetail(req: Request, res: Response, next: NextFunction) {
  try {
    const detail = await getNewsletterById(String(req.params.id))
    if (!detail) {
      res.status(404).json({ success: false, message: "Newsletter not found" })
      return
    }
    res.status(200).json({ success: true, ...detail })
  } catch (error) {
    next(error)
  }
}
