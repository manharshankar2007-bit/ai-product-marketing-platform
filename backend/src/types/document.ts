export interface UploadSuccessResponse {
  success: true
  filename: string
  originalName: string
  size: number
  uploadedAt: string
  pages: number
  textLength: number
  rawText: string
  cleanText: string
}

export interface UploadErrorResponse {
  success: false
  message: string
}
