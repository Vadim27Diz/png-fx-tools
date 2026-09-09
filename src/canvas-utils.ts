// OffscreenCanvas instead of `document.createElement('canvas')` — the one
// change that makes `pipeline.ts` and `image-codec.ts` runnable both on
// the panel's main thread and inside `pipeline-worker.ts` (PLAN.md §05
// Phase 05), since a Worker has no `document`. Modern Chromium (the panel
// iframe and the worker it spawns are both the same engine) supports
// OffscreenCanvas in both places, so there's no separate DOM-canvas path
// to maintain.

export function createCanvas(width: number, height: number): OffscreenCanvas {
  return new OffscreenCanvas(width, height)
}

export function getContext2D(canvas: OffscreenCanvas): OffscreenCanvasRenderingContext2D {
  const context = canvas.getContext('2d', { willReadFrequently: true })
  if (context === null) {
    throw new Error('Canvas 2D is not available in this environment.')
  }
  return context
}
