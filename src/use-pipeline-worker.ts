import { useEffect, useMemo, useRef } from 'preact/hooks'

// esbuild's `text` loader (wired in `build-figma-plugin.ui.cjs`) turns
// this into a plain JS string at build time — see `text-module.d.ts` for
// the ambient module declaration `tsc` needs to accept the import, and
// `scripts/worker-bundle.mjs` for what actually generates the file.
import workerBundleSource from './generated/pipeline-worker-bundle.txt'
import { NodeToggles, PipelineSettings } from './pipeline'
import { ImageMimeType } from './types'
import { WorkerRequest, WorkerResponse } from './worker-protocol'

export interface FullResult {
  pngBytes: Uint8Array
  width: number
  height: number
  wasDownscaled: boolean
}

export interface PipelineWorkerHandle {
  runPreview: (source: ImageData, settings: PipelineSettings, toggles: NodeToggles) => Promise<ImageData>
  runFull: (
    bytes: Uint8Array,
    mimeType: ImageMimeType,
    settings: PipelineSettings,
    toggles: NodeToggles
  ) => Promise<FullResult>
}

// The panel is a single self-contained HTML document — there's no server
// to serve a separate worker script from, so the worker is built from a
// Blob URL of its own bundled source instead of `new Worker('file.js')`.
// One URL is enough for the panel's whole lifetime; it's revoked only
// implicitly when the panel document itself unloads.
let workerBlobUrl: string | null = null
function getWorkerBlobUrl(): string {
  if (workerBlobUrl === null) {
    const blob = new Blob([workerBundleSource], { type: 'application/javascript' })
    workerBlobUrl = URL.createObjectURL(blob)
  }
  return workerBlobUrl
}

interface PendingJob {
  resolve: (response: WorkerResponse) => void
  reject: (error: Error) => void
}

/**
 * Owns the one worker the panel spawns for pipeline work (PLAN.md §05
 * Phase 05) — a single instance shared by live preview and batch Apply,
 * requests correlated by an incrementing `jobId` the same way
 * `waitForEither` correlates the main.ts message bus by `nodeId`.
 */
export function usePipelineWorker(): PipelineWorkerHandle {
  const workerRef = useRef<Worker | null>(null)
  const pendingRef = useRef(new Map<number, PendingJob>())
  const jobIdRef = useRef(0)

  useEffect(function () {
    const worker = new Worker(getWorkerBlobUrl())
    worker.onmessage = function (event: MessageEvent<WorkerResponse>) {
      const response = event.data
      const pending = pendingRef.current.get(response.jobId)
      if (pending === undefined) return
      pendingRef.current.delete(response.jobId)
      if (response.kind === 'error') {
        pending.reject(new Error(response.message))
      } else {
        pending.resolve(response)
      }
    }
    worker.onerror = function (event: ErrorEvent) {
      for (const pending of Array.from(pendingRef.current.values())) {
        pending.reject(new Error(event.message))
      }
      pendingRef.current.clear()
    }
    workerRef.current = worker
    return function () {
      worker.terminate()
      workerRef.current = null
    }
  }, [])

  return useMemo(function () {
    function send(request: WorkerRequest, transfer: Transferable[]): Promise<WorkerResponse> {
      return new Promise(function (resolve, reject) {
        const worker = workerRef.current
        if (worker === null) {
          reject(new Error('Background processing thread is unavailable.'))
          return
        }
        pendingRef.current.set(request.jobId, { resolve, reject })
        worker.postMessage(request, transfer)
      })
    }

    return {
      async runPreview(source, settings, toggles) {
        const jobId = (jobIdRef.current += 1)
        const response = await send({ kind: 'run-preview', jobId, source, settings, toggles }, [])
        if (response.kind !== 'preview-result') {
          throw new Error('Invalid response from the background thread.')
        }
        return response.processed
      },
      async runFull(bytes, mimeType, settings, toggles) {
        const jobId = (jobIdRef.current += 1)
        const response = await send({ kind: 'run-full', jobId, bytes, mimeType, settings, toggles }, [bytes.buffer])
        if (response.kind !== 'full-result') {
          throw new Error('Invalid response from the background thread.')
        }
        return {
          pngBytes: response.pngBytes,
          width: response.width,
          height: response.height,
          wasDownscaled: response.wasDownscaled
        }
      }
    }
  }, [])
}
