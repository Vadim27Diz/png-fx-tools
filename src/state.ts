import { emit, on } from '@create-figma-plugin/utilities'
import { useEffect, useMemo, useReducer } from 'preact/hooks'

import { DEFAULT_SETTINGS, DEFAULT_TOGGLES, ModuleId, NodeToggles, PipelineSettings } from './pipeline'
import { PreviewState } from './preview-state'
import {
  ImageBytesErrorHandler,
  ImageBytesLoadedHandler,
  ImageMimeType,
  RequestImageBytesHandler,
  SelectionChangedHandler,
  SelectionState
} from './types'

interface BytesEntry {
  status: 'loading' | 'loaded' | 'error'
  mimeType?: ImageMimeType
  bytes?: Uint8Array
  message?: string
}

interface State {
  selection: SelectionState
  bytesByNodeId: Record<string, BytesEntry>
  toggles: NodeToggles
  settings: PipelineSettings
  openModuleId: ModuleId | null
  checkerboard: boolean
}

type Action =
  | { type: 'selection-changed'; selection: SelectionState }
  | { type: 'bytes-loading'; nodeId: string }
  | { type: 'bytes-loaded'; nodeId: string; mimeType: ImageMimeType; bytes: Uint8Array }
  | { type: 'bytes-error'; nodeId: string; message: string }
  | { type: 'toggle-module'; id: ModuleId }
  | { type: 'open-module'; id: ModuleId | null }
  | { type: 'update-setting'; key: keyof PipelineSettings; value: PipelineSettings[keyof PipelineSettings] }
  | { type: 'toggle-checkerboard' }
  | { type: 'set-pipeline-state'; settings: PipelineSettings; toggles: NodeToggles }

export const initialState: State = {
  selection: { eligible: [], ineligibleCount: 0 },
  bytesByNodeId: {},
  toggles: DEFAULT_TOGGLES,
  settings: DEFAULT_SETTINGS,
  openModuleId: 1,
  checkerboard: true
}

export function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'selection-changed':
      return { ...state, selection: action.selection }
    case 'bytes-loading':
      return { ...state, bytesByNodeId: { ...state.bytesByNodeId, [action.nodeId]: { status: 'loading' } } }
    case 'bytes-loaded':
      return {
        ...state,
        bytesByNodeId: {
          ...state.bytesByNodeId,
          [action.nodeId]: { status: 'loaded', mimeType: action.mimeType, bytes: action.bytes }
        }
      }
    case 'bytes-error':
      return {
        ...state,
        bytesByNodeId: { ...state.bytesByNodeId, [action.nodeId]: { status: 'error', message: action.message } }
      }
    case 'toggle-module':
      return { ...state, toggles: { ...state.toggles, [action.id]: !state.toggles[action.id] } }
    case 'open-module':
      return { ...state, openModuleId: action.id }
    case 'update-setting':
      return { ...state, settings: { ...state.settings, [action.key]: action.value } }
    case 'toggle-checkerboard':
      return { ...state, checkerboard: !state.checkerboard }
    case 'set-pipeline-state':
      return { ...state, settings: action.settings, toggles: action.toggles }
    default:
      return state
  }
}

export function usePluginState() {
  const [state, dispatch] = useReducer(reducer, initialState)
  const activeNodeId = state.selection.eligible[0]?.nodeId ?? null
  const activeBytes = activeNodeId === null ? undefined : state.bytesByNodeId[activeNodeId]

  // Subscribe to the sandbox once (PLAN.md §02 message bus). Apply
  // progress/results are owned by useBatchApply, which correlates its
  // own APPLY_DONE/APPLY_ERROR listeners by nodeId — this effect only
  // tracks selection and the single "active" layer's preview bytes.
  useEffect(function () {
    on<SelectionChangedHandler>('SELECTION_CHANGED', function (selection) {
      dispatch({ type: 'selection-changed', selection })
    })
    on<ImageBytesLoadedHandler>('IMAGE_BYTES_LOADED', function (payload) {
      dispatch({ type: 'bytes-loaded', nodeId: payload.nodeId, mimeType: payload.mimeType, bytes: payload.bytes })
      // A layer that was processed before carries the settings it was
      // last run with (PLAN.md §06 "Память по слою") — load them as the
      // new starting point rather than leaving whatever was dialed in
      // for the previous layer.
      if (payload.remembered !== undefined) {
        dispatch({ type: 'set-pipeline-state', settings: payload.remembered.settings, toggles: payload.remembered.toggles })
      }
    })
    on<ImageBytesErrorHandler>('IMAGE_BYTES_ERROR', function (error) {
      dispatch({ type: 'bytes-error', nodeId: error.nodeId, message: error.message })
    })
  }, [])

  // Fetch bytes for the active layer the first time it is selected.
  useEffect(
    function () {
      if (activeNodeId === null || activeBytes !== undefined) return
      dispatch({ type: 'bytes-loading', nodeId: activeNodeId })
      emit<RequestImageBytesHandler>('REQUEST_IMAGE_BYTES', { nodeId: activeNodeId })
    },
    [activeNodeId, activeBytes]
  )

  const previewState: PreviewState = useMemo(
    function () {
      if (activeNodeId === null) return { status: 'empty' }
      if (activeBytes === undefined || activeBytes.status === 'loading') return { status: 'loading' }
      if (activeBytes.status === 'error') return { status: 'error', message: activeBytes.message ?? '' }
      return { status: 'loaded', bytes: activeBytes.bytes as Uint8Array, mimeType: activeBytes.mimeType as ImageMimeType }
    },
    [activeNodeId, activeBytes]
  )

  return {
    selection: state.selection,
    activeNodeId,
    activeName: state.selection.eligible.find(function (image) {
      return image.nodeId === activeNodeId
    })?.name ?? null,
    previewState,
    toggles: state.toggles,
    settings: state.settings,
    openModuleId: state.openModuleId,
    checkerboard: state.checkerboard,
    openModule: function (id: ModuleId | null) {
      dispatch({ type: 'open-module', id })
    },
    toggleModule: function (id: ModuleId) {
      dispatch({ type: 'toggle-module', id })
    },
    updateSetting: function <K extends keyof PipelineSettings>(key: K, value: PipelineSettings[K]) {
      dispatch({ type: 'update-setting', key, value })
    },
    toggleCheckerboard: function () {
      dispatch({ type: 'toggle-checkerboard' })
    },
    setPipelineState: function (settings: PipelineSettings, toggles: NodeToggles) {
      dispatch({ type: 'set-pipeline-state', settings, toggles })
    }
  }
}
