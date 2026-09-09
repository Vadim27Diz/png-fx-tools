// Message contract for `pipeline-worker.ts` ↔ `use-pipeline-worker.ts`
// (PLAN.md §05 Phase 05). Mirrors the main.ts ↔ ui.tsx split in
// `types.ts`: one file both sides import, so a shape change fails the
// typecheck on whichever side forgets to follow along.

import { NodeToggles, PipelineSettings } from './pipeline'
import { ImageMimeType } from './types'

export type WorkerRequest =
  | {
      kind: 'run-preview'
      jobId: number
      source: ImageData
      settings: PipelineSettings
      toggles: NodeToggles
    }
  | {
      kind: 'run-full'
      jobId: number
      bytes: Uint8Array
      mimeType: ImageMimeType
      settings: PipelineSettings
      toggles: NodeToggles
    }

export type WorkerResponse =
  | { kind: 'preview-result'; jobId: number; processed: ImageData }
  | { kind: 'full-result'; jobId: number; pngBytes: Uint8Array; width: number; height: number; wasDownscaled: boolean }
  | { kind: 'error'; jobId: number; message: string }
