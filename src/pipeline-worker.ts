// The actual Web Worker entry point (PLAN.md §05 Phase 05). Bundled
// standalone by `scripts/worker-bundle.mjs` into
// `src/generated/pipeline-worker-bundle.txt` and inlined as a string into
// the panel bundle — a Figma plugin panel is a single self-contained HTML
// document with no server to fetch a separate worker script from, so the
// worker has to be spun up from a Blob URL built out of that string (see
// `use-pipeline-worker.ts`).
//
// Doing the heavy per-pixel work here, off the panel's main thread, is
// the whole point: a 4K image's pipeline pass no longer freezes the
// controls while it runs.
//
// The project's tsconfig only pulls in the "DOM" lib, not "webworker"
// (@create-figma-plugin/tsconfig — see PLAN.md §05), so `self` here is
// typed as `Window`, whose `postMessage(message, targetOrigin, transfer?)`
// overloads don't match a worker's `postMessage(message, transfer?)`. The
// cast below is the one place that boundary is bridged; everything else
// in this file typechecks normally.

import { createCanvas, getContext2D } from './canvas-utils'
import { decodeToImageData, encodeToPngBytes } from './image-codec'
import { FIGMA_MAX_IMAGE_DIMENSION } from './limits'
import { runPipeline } from './pipeline'
import { WorkerRequest, WorkerResponse } from './worker-protocol'

interface WorkerScope {
  onmessage: ((event: MessageEvent<WorkerRequest>) => void) | null
  postMessage: (message: WorkerResponse, transfer: Transferable[]) => void
}

const scope = self as unknown as WorkerScope

/**
 * Figma's `createImage` rejects a side over 4096px (PLAN.md §03). Resize
 * and Tile can both grow the frame past the source's own dimensions, so
 * this checks the pipeline's *output*, not its input, and shrinks it back
 * into range rather than letting Apply fail outright.
 */
async function clampToFigmaLimit(image: ImageData): Promise<{ image: ImageData; wasDownscaled: boolean }> {
  const longestSide = Math.max(image.width, image.height)
  if (longestSide <= FIGMA_MAX_IMAGE_DIMENSION) {
    return { image, wasDownscaled: false }
  }
  const scale = FIGMA_MAX_IMAGE_DIMENSION / longestSide
  const targetWidth = Math.max(1, Math.round(image.width * scale))
  const targetHeight = Math.max(1, Math.round(image.height * scale))

  const source = createCanvas(image.width, image.height)
  getContext2D(source).putImageData(image, 0, 0)
  const target = createCanvas(targetWidth, targetHeight)
  const targetContext = getContext2D(target)
  targetContext.drawImage(source, 0, 0, image.width, image.height, 0, 0, targetWidth, targetHeight)
  return { image: targetContext.getImageData(0, 0, targetWidth, targetHeight), wasDownscaled: true }
}

async function handleRequest(request: WorkerRequest): Promise<void> {
  if (request.kind === 'run-preview') {
    // `request.source` arrived via postMessage's structured clone, so
    // it's already a private copy — safe for `runPipeline` to mutate
    // in place, same as the main-thread version used to do.
    const processed = runPipeline(request.source, request.settings, request.toggles)
    scope.postMessage({ kind: 'preview-result', jobId: request.jobId, processed }, [processed.data.buffer])
    return
  }

  const decoded = await decodeToImageData(request.bytes, request.mimeType)
  const processed = runPipeline(decoded, request.settings, request.toggles)
  const { image: clamped, wasDownscaled } = await clampToFigmaLimit(processed)
  const pngBytes = await encodeToPngBytes(clamped)
  scope.postMessage(
    {
      kind: 'full-result',
      jobId: request.jobId,
      pngBytes,
      width: clamped.width,
      height: clamped.height,
      wasDownscaled
    },
    [pngBytes.buffer]
  )
}

scope.onmessage = function (event) {
  const request = event.data
  handleRequest(request).catch(function (error: unknown) {
    scope.postMessage(
      {
        kind: 'error',
        jobId: request.jobId,
        message: error instanceof Error ? error.message : 'Could not process the image in the background thread.'
      },
      []
    )
  })
}
