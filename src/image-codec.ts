// Decode/encode helpers built on OffscreenCanvas (PLAN.md §05 Phase 05),
// so the exact same code runs on the panel's main thread (live preview's
// "before" pane) and inside `pipeline-worker.ts` (full-resolution Apply)
// — a Worker has no `document` to hang a DOM canvas off of.

import { createCanvas, getContext2D } from './canvas-utils'

/**
 * `maxDimension`, when given, downscales the decoded image so its longest
 * side never exceeds it — used for the live preview's downsized copy
 * (PLAN.md §05 Phase 05). Omitted entirely for the full-resolution Apply
 * path.
 */
export async function decodeToImageData(bytes: Uint8Array, mimeType: string, maxDimension?: number): Promise<ImageData> {
  // TS's DOM lib types Uint8Array's buffer as ArrayBufferLike, which is
  // stricter than Blob's constructor actually requires at runtime.
  const blob = new Blob([bytes as BlobPart], { type: mimeType })
  const bitmap = await createImageBitmap(blob)

  let targetWidth = bitmap.width
  let targetHeight = bitmap.height
  if (maxDimension !== undefined) {
    const scale = Math.min(1, maxDimension / Math.max(bitmap.width, bitmap.height))
    targetWidth = Math.max(1, Math.round(bitmap.width * scale))
    targetHeight = Math.max(1, Math.round(bitmap.height * scale))
  }

  const canvas = createCanvas(targetWidth, targetHeight)
  const context = getContext2D(canvas)
  context.drawImage(bitmap, 0, 0, bitmap.width, bitmap.height, 0, 0, targetWidth, targetHeight)
  bitmap.close()
  return context.getImageData(0, 0, targetWidth, targetHeight)
}

export async function encodeToPngBytes(imageData: ImageData): Promise<Uint8Array> {
  const canvas = createCanvas(imageData.width, imageData.height)
  const context = getContext2D(canvas)
  context.putImageData(imageData, 0, 0)
  const blob = await canvas.convertToBlob({ type: 'image/png' })
  const buffer = await blob.arrayBuffer()
  return new Uint8Array(buffer)
}
