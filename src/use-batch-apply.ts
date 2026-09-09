import { emit } from '@create-figma-plugin/utilities'
import { useCallback, useRef, useState } from 'preact/hooks'

import { waitForEither } from './message-bus'
import { NodeToggles, PipelineSettings } from './pipeline'
import {
  ApplyDoneHandler,
  ApplyErrorHandler,
  ApplyResultHandler,
  EligibleImage,
  FocusNodesHandler,
  ImageBytesErrorHandler,
  ImageBytesLoadedHandler,
  RequestImageBytesHandler
} from './types'
import { PipelineWorkerHandle } from './use-pipeline-worker'

export interface BatchProgress {
  total: number
  done: number
  currentName: string
}

export interface BatchFailure {
  name: string
  message: string
}

export interface BatchOutcome {
  succeeded: number
  failed: BatchFailure[]
  cancelled: boolean
  // Layers whose result was shrunk to fit Figma's 4096px `createImage`
  // limit (PLAN.md §03, §05 Phase 05) — the layer still succeeded, just
  // not at the pipeline's literal output size.
  downscaledNames: string[]
}

export interface BatchApply {
  isRunning: boolean
  progress: BatchProgress | null
  lastOutcome: BatchOutcome | null
  start: (images: EligibleImage[], settings: PipelineSettings, toggles: NodeToggles) => void
  cancel: () => void
}

/**
 * Runs the same settings/toggles across every eligible layer in the
 * selection, one at a time (PLAN.md §05 Phase 04). Sequential, not
 * parallel: each layer's byte round trip and apply round trip complete
 * before the next one starts, which keeps progress reporting honest.
 * Every mutation lands inside the same running plugin session — main.ts
 * never calls `figma.commitUndo()` — so Figma groups the whole run into a
 * single Undo step for free.
 */
export function useBatchApply(pipelineWorker: PipelineWorkerHandle): BatchApply {
  const [isRunning, setIsRunning] = useState(false)
  const [progress, setProgress] = useState<BatchProgress | null>(null)
  const [lastOutcome, setLastOutcome] = useState<BatchOutcome | null>(null)
  const cancelRef = useRef(false)

  const start = useCallback(
    function (images: EligibleImage[], settings: PipelineSettings, toggles: NodeToggles) {
      if (images.length === 0) return
      cancelRef.current = false
      setLastOutcome(null)
      setIsRunning(true)
      setProgress({ total: images.length, done: 0, currentName: images[0].name })

      void (async function runBatch() {
        const resultNodeIds = new Set<string>()
        const failed: BatchFailure[] = []
        const downscaledNames: string[] = []
        let cancelled = false
        let processedCount = 0

        for (const image of images) {
          if (cancelRef.current) {
            cancelled = true
            break
          }

          try {
            emit<RequestImageBytesHandler>('REQUEST_IMAGE_BYTES', { nodeId: image.nodeId })
            const bytesOutcome = await waitForEither<ImageBytesLoadedHandler, ImageBytesErrorHandler>(
              'IMAGE_BYTES_LOADED',
              function (payload) {
                return payload.nodeId === image.nodeId
              },
              'IMAGE_BYTES_ERROR',
              function (payload) {
                return payload.nodeId === image.nodeId
              }
            )
            if (bytesOutcome.which === 'b') {
              failed.push({ name: image.name, message: bytesOutcome.payload.message })
              continue
            }

            const result = await pipelineWorker.runFull(
              bytesOutcome.payload.bytes,
              bytesOutcome.payload.mimeType,
              settings,
              toggles
            )
            if (result.wasDownscaled) downscaledNames.push(image.name)

            emit<ApplyResultHandler>('APPLY_RESULT', {
              nodeId: image.nodeId,
              bytes: result.pngBytes,
              width: result.width,
              height: result.height,
              settings,
              toggles
            })
            const applyOutcome = await waitForEither<ApplyDoneHandler, ApplyErrorHandler>(
              'APPLY_DONE',
              function (payload) {
                return payload.nodeId === image.nodeId
              },
              'APPLY_ERROR',
              function (payload) {
                return payload.nodeId === image.nodeId
              }
            )
            if (applyOutcome.which === 'b') {
              failed.push({ name: image.name, message: applyOutcome.payload.message })
              continue
            }

            resultNodeIds.add(applyOutcome.payload.resultNodeId)
          } catch (error) {
            failed.push({
              name: image.name,
              message: error instanceof Error ? error.message : 'Could not process the image.'
            })
          }

          processedCount += 1
          setProgress({ total: images.length, done: processedCount, currentName: image.name })
        }

        if (resultNodeIds.size > 0) {
          emit<FocusNodesHandler>('FOCUS_NODES', { nodeIds: Array.from(resultNodeIds) })
        }

        setProgress(null)
        setIsRunning(false)
        setLastOutcome({ succeeded: processedCount - failed.length, failed, cancelled, downscaledNames })
      })()
    },
    [pipelineWorker]
  )

  const cancel = useCallback(function () {
    cancelRef.current = true
  }, [])

  return { isRunning, progress, lastOutcome, start, cancel }
}
