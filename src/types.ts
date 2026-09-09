import { EventHandler } from '@create-figma-plugin/utilities'

import { NodeToggles, PipelineSettings } from './pipeline'
import { WindowSize } from './window-size'

// ── Domain types ─────────────────────────────────────────────────────────
// Shared between the sandbox (main.ts) and the panel (ui.tsx). See
// PLAN.md §02 for the two-process architecture this bus implements.

export interface EligibleImage {
  nodeId: string
  name: string
  width: number
  height: number
}

export interface SelectionState {
  eligible: EligibleImage[]
  ineligibleCount: number
}

export type ImageMimeType = 'image/png' | 'image/jpeg'

// A layer's settings from the run it was last processed with (PLAN.md §06
// "Память по слою"), written to `setPluginData` on Apply and read back the
// next time that layer becomes the active preview.
export interface RememberedState {
  settings: PipelineSettings
  toggles: NodeToggles
}

export interface ImageBytesPayload {
  nodeId: string
  bytes: Uint8Array
  mimeType: ImageMimeType
  width: number
  height: number
  remembered?: RememberedState
}

// A named, whole-pipeline settings bundle saved to `clientStorage` (PLAN.md
// §06 "Пресеты") — available in every file, unlike per-layer memory which
// lives on the node itself.
export interface Preset {
  id: string
  name: string
  settings: PipelineSettings
  toggles: NodeToggles
}

export interface PluginError {
  nodeId: string
  message: string
}

export interface ApplyRequest {
  nodeId: string
  bytes: Uint8Array
  width: number
  height: number
  // The settings this result was produced with — main.ts writes them to
  // the result node's plugin data (PLAN.md §06 "Память по слою") so
  // re-selecting that layer later restores them.
  settings: PipelineSettings
  toggles: NodeToggles
}

export interface ApplyDonePayload {
  nodeId: string
  // Selection/scrolling happens once, after a whole batch, via
  // FOCUS_NODES — not per item — so this is what gets collected for it.
  resultNodeId: string
}

// ── Message bus: main.ts → ui.tsx ──────────────────────────────────────

export interface SelectionChangedHandler extends EventHandler {
  name: 'SELECTION_CHANGED'
  handler: (selection: SelectionState) => void
}

export interface ImageBytesLoadedHandler extends EventHandler {
  name: 'IMAGE_BYTES_LOADED'
  handler: (payload: ImageBytesPayload) => void
}

export interface ImageBytesErrorHandler extends EventHandler {
  name: 'IMAGE_BYTES_ERROR'
  handler: (error: PluginError) => void
}

export interface ApplyDoneHandler extends EventHandler {
  name: 'APPLY_DONE'
  handler: (payload: ApplyDonePayload) => void
}

export interface ApplyErrorHandler extends EventHandler {
  name: 'APPLY_ERROR'
  handler: (error: PluginError) => void
}

// ── Message bus: ui.tsx → main.ts ──────────────────────────────────────

export interface RequestImageBytesHandler extends EventHandler {
  name: 'REQUEST_IMAGE_BYTES'
  handler: (payload: { nodeId: string }) => void
}

export interface ApplyResultHandler extends EventHandler {
  name: 'APPLY_RESULT'
  handler: (payload: ApplyRequest) => void
}

export interface ResizeWindowHandler extends EventHandler {
  name: 'RESIZE_WINDOW'
  handler: (size: WindowSize) => void
}

export interface FocusNodesHandler extends EventHandler {
  name: 'FOCUS_NODES'
  handler: (payload: { nodeIds: string[] }) => void
}

// ── Message bus: presets (PLAN.md §06) ─────────────────────────────────

export interface PresetsChangedHandler extends EventHandler {
  name: 'PRESETS_CHANGED'
  handler: (payload: { presets: Preset[] }) => void
}

export interface RequestPresetsHandler extends EventHandler {
  name: 'REQUEST_PRESETS'
  handler: () => void
}

export interface SavePresetHandler extends EventHandler {
  name: 'SAVE_PRESET'
  handler: (payload: { name: string; settings: PipelineSettings; toggles: NodeToggles }) => void
}

export interface DeletePresetHandler extends EventHandler {
  name: 'DELETE_PRESET'
  handler: (payload: { id: string }) => void
}
