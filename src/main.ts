import { emit, on, showUI } from '@create-figma-plugin/utilities'

import {
  ApplyDoneHandler,
  ApplyErrorHandler,
  ApplyRequest,
  ApplyResultHandler,
  DeletePresetHandler,
  EligibleImage,
  FocusNodesHandler,
  ImageBytesErrorHandler,
  ImageBytesLoadedHandler,
  ImageMimeType,
  Preset,
  PresetsChangedHandler,
  RememberedState,
  RequestImageBytesHandler,
  RequestPresetsHandler,
  ResizeWindowHandler,
  SavePresetHandler,
  SelectionChangedHandler,
  SelectionState
} from './types'
import { DEFAULT_WINDOW_SIZE, MIN_WINDOW_SIZE, WindowSize } from './window-size'

const WINDOW_SIZE_STORAGE_KEY = 'png-fx-tools:window-size'
const PRESETS_STORAGE_KEY = 'png-fx-tools:presets'
// Plugin data lives on the node itself, not clientStorage — it travels
// with the file, unlike presets (PLAN.md §06 "Память по слою" vs
// "Пресеты").
const REMEMBERED_STATE_KEY = 'png-fx-tools:settings'

// ── Presets (PLAN.md §06 — clientStorage, shared across every file) ─────

async function loadPresetsAsync(): Promise<Preset[]> {
  const stored = (await figma.clientStorage.getAsync(PRESETS_STORAGE_KEY)) as Preset[] | undefined
  return Array.isArray(stored) ? stored : []
}

async function savePresetsAsync(presets: Preset[]): Promise<void> {
  await figma.clientStorage.setAsync(PRESETS_STORAGE_KEY, presets)
}

function generatePresetId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
}

// ── Per-layer memory (PLAN.md §06 — setPluginData, travels with the node)

function readRememberedState(node: SceneNode): RememberedState | undefined {
  const raw = node.getPluginData(REMEMBERED_STATE_KEY)
  if (raw === '') return undefined
  try {
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed === 'object' && parsed !== null && 'settings' in parsed && 'toggles' in parsed) {
      return parsed as RememberedState
    }
  } catch {
    // Ignore data from a future/incompatible version of the plugin.
  }
  return undefined
}

function writeRememberedState(node: SceneNode, state: RememberedState): void {
  node.setPluginData(REMEMBERED_STATE_KEY, JSON.stringify(state))
}

// ── Eligibility (PLAN.md §02 — "Что плагин принимает на вход") ──────────
// A layer qualifies purely by having a visible IMAGE fill. Imported SVG
// never gets one (Figma turns it into vector shapes), so vectors and text
// are excluded without a dedicated check. The byte signature then rejects
// anything that isn't actually PNG or JPEG (e.g. a GIF fill).

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47]
const JPEG_SIGNATURE = [0xff, 0xd8, 0xff]

function matchesSignature(bytes: Uint8Array, signature: number[]): boolean {
  if (bytes.length < signature.length) return false
  for (let index = 0; index < signature.length; index += 1) {
    if (bytes[index] !== signature[index]) return false
  }
  return true
}

function detectMimeType(bytes: Uint8Array): ImageMimeType | null {
  if (matchesSignature(bytes, PNG_SIGNATURE)) return 'image/png'
  if (matchesSignature(bytes, JPEG_SIGNATURE)) return 'image/jpeg'
  return null
}

function hasFills(node: BaseNode): node is BaseNode & { fills: Paint[] | symbol } {
  return 'fills' in node
}

function canResize(node: BaseNode): node is BaseNode & { resize: (width: number, height: number) => void } {
  return 'resize' in node && typeof (node as { resize?: unknown }).resize === 'function'
}

function findImageFill(node: SceneNode): ImagePaint | null {
  if (!hasFills(node)) return null
  const fills = node.fills
  if (!Array.isArray(fills)) return null
  const imageFill = fills.find(function (fill): fill is ImagePaint {
    return fill.type === 'IMAGE' && fill.visible !== false
  })
  return imageFill ?? null
}

function collectSelectionState(): SelectionState {
  const eligible: EligibleImage[] = []
  let ineligibleCount = 0
  for (const node of figma.currentPage.selection) {
    const fill = findImageFill(node)
    if (fill === null) {
      ineligibleCount += 1
      continue
    }
    eligible.push({
      nodeId: node.id,
      name: node.name,
      width: Math.round(node.width),
      height: Math.round(node.height)
    })
  }
  return { eligible, ineligibleCount }
}

function broadcastSelection(): void {
  emit<SelectionChangedHandler>('SELECTION_CHANGED', collectSelectionState())
}

async function findEligibleNodeAsync(nodeId: string): Promise<{ node: SceneNode; fill: ImagePaint } | null> {
  const node = await figma.getNodeByIdAsync(nodeId)
  if (node === null || !('type' in node) || node.type === 'DOCUMENT' || node.type === 'PAGE') {
    return null
  }
  const sceneNode = node as SceneNode
  const fill = findImageFill(sceneNode)
  if (fill === null) return null
  return { node: sceneNode, fill }
}

/**
 * Applies one processed image by replacing the source layer's own fill,
 * and returns the node the caller should treat as "the result"
 * (selected/focused once the whole batch finishes — see the APPLY_RESULT
 * handler and FOCUS_NODES below). Never touches `figma.currentPage.selection`
 * itself: a 20-layer batch selecting and scrolling to each node in turn
 * would be chaotic, so that only happens once, after every item in a run
 * has settled.
 */
async function applyResultAsync(request: ApplyRequest): Promise<SceneNode> {
  const match = await findEligibleNodeAsync(request.nodeId)
  if (match === null) {
    throw new Error('Layer was deleted, moved, or no longer contains an image.')
  }
  const { node } = match
  if (!hasFills(node)) throw new Error('This layer type does not support fills.')

  const image = figma.createImage(request.bytes)
  const fill: ImagePaint = { type: 'IMAGE', imageHash: image.hash, scaleMode: 'FILL' }
  ;(node as SceneNode & { fills: Paint[] }).fills = [fill]
  if (canResize(node)) node.resize(request.width, request.height)

  writeRememberedState(node, { settings: request.settings, toggles: request.toggles })
  return node
}

export default async function (): Promise<void> {
  const storedSize = (await figma.clientStorage.getAsync(WINDOW_SIZE_STORAGE_KEY)) as WindowSize | undefined
  const windowSize =
    storedSize !== undefined && typeof storedSize.width === 'number' && typeof storedSize.height === 'number'
      ? storedSize
      : DEFAULT_WINDOW_SIZE

  on<RequestImageBytesHandler>('REQUEST_IMAGE_BYTES', async function (payload) {
    const match = await findEligibleNodeAsync(payload.nodeId)
    if (match === null) {
      emit<ImageBytesErrorHandler>('IMAGE_BYTES_ERROR', {
        nodeId: payload.nodeId,
        message: 'Layer no longer contains an image.'
      })
      return
    }
    try {
      const imageHash = match.fill.imageHash
      const image = imageHash === null ? null : figma.getImageByHash(imageHash)
      if (image === null) {
        throw new Error('Could not find pixels for this fill.')
      }
      const bytes = await image.getBytesAsync()
      const mimeType = detectMimeType(bytes)
      if (mimeType === null) {
        emit<ImageBytesErrorHandler>('IMAGE_BYTES_ERROR', {
          nodeId: payload.nodeId,
          message: 'Select a PNG or JPEG raster image. Other formats are not supported.'
        })
        return
      }
      emit<ImageBytesLoadedHandler>('IMAGE_BYTES_LOADED', {
        nodeId: payload.nodeId,
        bytes,
        mimeType,
        width: Math.round(match.node.width),
        height: Math.round(match.node.height),
        remembered: readRememberedState(match.node)
      })
    } catch (error) {
      emit<ImageBytesErrorHandler>('IMAGE_BYTES_ERROR', {
        nodeId: payload.nodeId,
        message: error instanceof Error ? error.message : "Could not read the layer's pixels."
      })
    }
  })

  on<ApplyResultHandler>('APPLY_RESULT', async function (request) {
    try {
      const resultNode = await applyResultAsync(request)
      emit<ApplyDoneHandler>('APPLY_DONE', { nodeId: request.nodeId, resultNodeId: resultNode.id })
    } catch (error) {
      emit<ApplyErrorHandler>('APPLY_ERROR', {
        nodeId: request.nodeId,
        message: error instanceof Error ? error.message : 'Could not apply the result.'
      })
    }
  })

  on<FocusNodesHandler>('FOCUS_NODES', async function (payload) {
    const nodes: SceneNode[] = []
    for (const nodeId of payload.nodeIds) {
      const node = await figma.getNodeByIdAsync(nodeId)
      if (node !== null && 'type' in node && node.type !== 'DOCUMENT' && node.type !== 'PAGE') {
        nodes.push(node as SceneNode)
      }
    }
    if (nodes.length === 0) return
    figma.currentPage.selection = nodes
    figma.viewport.scrollAndZoomIntoView(nodes)
  })

  on<ResizeWindowHandler>('RESIZE_WINDOW', function (size) {
    const width = Math.max(MIN_WINDOW_SIZE.width, size.width)
    const height = Math.max(MIN_WINDOW_SIZE.height, size.height)
    figma.ui.resize(width, height)
    figma.clientStorage.setAsync(WINDOW_SIZE_STORAGE_KEY, { width, height })
  })

  on<RequestPresetsHandler>('REQUEST_PRESETS', async function () {
    emit<PresetsChangedHandler>('PRESETS_CHANGED', { presets: await loadPresetsAsync() })
  })

  on<SavePresetHandler>('SAVE_PRESET', async function (payload) {
    const presets = await loadPresetsAsync()
    presets.push({ id: generatePresetId(), name: payload.name, settings: payload.settings, toggles: payload.toggles })
    await savePresetsAsync(presets)
    emit<PresetsChangedHandler>('PRESETS_CHANGED', { presets })
  })

  on<DeletePresetHandler>('DELETE_PRESET', async function (payload) {
    const presets = (await loadPresetsAsync()).filter(function (preset) {
      return preset.id !== payload.id
    })
    await savePresetsAsync(presets)
    emit<PresetsChangedHandler>('PRESETS_CHANGED', { presets })
  })

  figma.on('selectionchange', broadcastSelection)

  showUI(windowSize)
  broadcastSelection()
  emit<PresetsChangedHandler>('PRESETS_CHANGED', { presets: await loadPresetsAsync() })
}
