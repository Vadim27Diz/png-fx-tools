import { useEffect, useRef, useState } from 'preact/hooks'

import { decodeToImageData } from './image-codec'
import { PREVIEW_MAX_DIMENSION } from './limits'
import { NodeToggles, PipelineSettings } from './pipeline'
import { ImageMimeType } from './types'
import { PipelineWorkerHandle } from './use-pipeline-worker'

export interface LivePreview {
  source: ImageData | null
  processed: ImageData | null
  error: string | null
}

// A Figma reviewer hit a case where decoding (or the worker round trip)
// never produced a result or an error, leaving the panel stuck on
// "Processing…" forever with no way out. `source`/`processed` staying
// `null` is meant to be a brief, self-resolving gap — this timeout makes
// sure it always resolves one way or the other.
const STAGE_TIMEOUT_MS = 15000

function withTimeout<T>(promise: Promise<T>, message: string): Promise<T> {
  return new Promise(function (resolve, reject) {
    const timer = setTimeout(function () {
      reject(new Error(message))
    }, STAGE_TIMEOUT_MS)
    promise.then(
      function (value) {
        clearTimeout(timer)
        resolve(value)
      },
      function (error) {
        clearTimeout(timer)
        reject(error)
      }
    )
  })
}

/**
 * Decodes the active layer's bytes once — downscaled to
 * `PREVIEW_MAX_DIMENSION` on the longest side, so a 4K source never has
 * to push full-resolution pixels through the pipeline on every settings
 * tweak (PLAN.md §05 Phase 05) — then re-runs the pipeline in the shared
 * worker whenever settings/toggles change, coalesced onto a single
 * animation frame the same way the original's `schedulePreview()` did.
 * `requestIdRef` drops a stale worker response if a newer request has
 * since been made (e.g. a fast slider drag outruns the previous frame's
 * round trip).
 */
export function useLivePreview(
  pipelineWorker: PipelineWorkerHandle,
  bytes: Uint8Array | undefined,
  mimeType: ImageMimeType | undefined,
  settings: PipelineSettings,
  toggles: NodeToggles
): LivePreview {
  const [source, setSource] = useState<ImageData | null>(null)
  const [processed, setProcessed] = useState<ImageData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const frameRef = useRef<number | null>(null)
  const requestIdRef = useRef(0)

  useEffect(
    function () {
      if (bytes === undefined || mimeType === undefined) {
        setSource(null)
        setError(null)
        return
      }
      let cancelled = false
      setError(null)
      withTimeout(decodeToImageData(bytes, mimeType, PREVIEW_MAX_DIMENSION), 'Timed out decoding this image.')
        .then(function (image) {
          if (!cancelled) setSource(image)
        })
        .catch(function (decodeError: unknown) {
          if (cancelled) return
          setSource(null)
          setError(decodeError instanceof Error ? decodeError.message : 'Could not decode this image for preview.')
        })
      return function () {
        cancelled = true
      }
    },
    [bytes, mimeType]
  )

  useEffect(
    function () {
      if (source === null) {
        setProcessed(null)
        return
      }
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current)
      frameRef.current = requestAnimationFrame(function () {
        frameRef.current = null
        const requestId = (requestIdRef.current += 1)
        withTimeout(pipelineWorker.runPreview(source, settings, toggles), 'Timed out processing this image.')
          .then(function (result) {
            if (requestIdRef.current === requestId) setProcessed(result)
          })
          .catch(function (pipelineError: unknown) {
            if (requestIdRef.current !== requestId) return
            setProcessed(null)
            // The raw decode is still shown as a fallback while this
            // module pipeline is broken, so this isn't fatal to the
            // preview the way a decode failure is — just surface it.
            setError(pipelineError instanceof Error ? pipelineError.message : 'Could not process this image for preview.')
          })
      })
      return function () {
        if (frameRef.current !== null) {
          cancelAnimationFrame(frameRef.current)
          frameRef.current = null
        }
      }
    },
    [pipelineWorker, source, settings, toggles]
  )

  return { source, processed, error }
}
