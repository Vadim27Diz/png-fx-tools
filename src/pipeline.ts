// Settings model ported from PNG_FX_Tools.html's `defaultSettings` /
// `defaultNodeToggles`. `stripMetadata` was dropped (PLAN.md §01 — a
// canvas re-encode already strips it, the toggle did nothing real).
//
// `runPipeline` is the Phase 02 port of `processCanvas()`, always run in
// that function's export mode (`isPreviewMode = false`): no preview
// downscale, no canvas backdrop compositing, no edge stroke — those were
// preview-only decoration in the original and never touched the bytes
// that got saved. Stage order matches the source exactly; the only
// algorithmic change is the chroma-key choker, rewritten from an O(r²)
// per-pixel square kernel to a separable two-pass box min/max (O(r)) —
// see `applyChoker` below for the equivalence argument.

import { createCanvas, getContext2D } from './canvas-utils'

export type ColorMode = 'white' | 'grayscale' | 'black_extract' | 'chroma_key' | 'original'
export type RecolorBlendMode = 'multiply' | 'tint2color' | 'tritone'
export type LayerBlendMode = 'multiply' | 'screen' | 'add'

export interface PipelineSettings {
  // Node 1 · Alpha Settings
  skipAlpha: boolean
  colorMode: ColorMode
  threshold: number
  multiply: number
  keyerColor: string
  keyerTolerance: number
  keyerFuzziness: number
  keyerChoker: number
  // Node 2 · Levels
  levelsMin: number
  levelsGamma: number
  levelsMax: number
  // Node 3 · Recolor
  blendMode: RecolorBlendMode
  // Each stop's own opacity, 0-100 — how strongly *that* color blends
  // over the original pixel wherever it applies, independent of the
  // other stops (so e.g. light can sit at 100% while dark sits at 40%
  // in Duotone). Mirrors a Figma fill's own opacity slider, which the
  // color-picker widget already surfaces per swatch — see
  // recolor-controls.tsx.
  multiplyColor: string
  multiplyColorOpacity: number
  midTintColor: string
  midTintColorOpacity: number
  darkTintColor: string
  darkTintColorOpacity: number
  tintBalance: number
  // Node 4 · Hue / Saturation
  hue: number
  saturation: number
  lightness: number
  // Node 5 · Blend Pipeline
  layerBlendMode: LayerBlendMode
  layerPower: number
  // Seamless Tiling
  tilerOffsetX: number
  tilerOffsetY: number
  tilerFade: number
  // Pipeline Utilities
  autoCrop: boolean
  showStroke: boolean
  strokeColor: string
}

export const DEFAULT_SETTINGS: PipelineSettings = {
  skipAlpha: false,
  colorMode: 'black_extract',
  threshold: 0,
  multiply: 1,
  keyerColor: '#00ff00',
  keyerTolerance: 30,
  keyerFuzziness: 20,
  keyerChoker: 0,
  levelsMin: 0,
  levelsGamma: 1,
  levelsMax: 255,
  blendMode: 'multiply',
  multiplyColor: '#00ffcc',
  multiplyColorOpacity: 100,
  midTintColor: '#888888',
  midTintColorOpacity: 100,
  darkTintColor: '#000000',
  darkTintColorOpacity: 100,
  tintBalance: 0.5,
  hue: 0,
  saturation: 100,
  lightness: 100,
  // Power 1 alone is close to invisible for every mode (a single pass is
  // mostly just re-drawing the source once), so power 2 is the default —
  // visibly non-identity the moment the module is turned on. There used
  // to be a 'normal' mode too, but the export path always starts
  // compositing onto a fully transparent frame (there's no preview
  // backdrop to blend onto here), and 'normal' always sets
  // blendR/G/B = sourceR/G/B and writes the final alpha straight from
  // the source — so at *any* power it was a proven, exact mathematical
  // no-op, not an actual blend mode. Removed rather than left as a dead
  // option in the dropdown.
  layerBlendMode: 'multiply',
  layerPower: 2,
  tilerOffsetX: 50,
  tilerOffsetY: 50,
  tilerFade: 20,
  autoCrop: false,
  showStroke: false,
  strokeColor: '#ff0000'
}

export type ModuleId = 1 | 2 | 3 | 4 | 5 | 'tiler'

export type NodeToggles = Record<ModuleId, boolean>

export const DEFAULT_TOGGLES: NodeToggles = {
  1: true,
  2: false,
  3: false,
  4: false,
  5: false,
  tiler: false
}

export interface ModuleDescriptor {
  id: ModuleId
  title: string
  description: string
}

export const MODULES: ModuleDescriptor[] = [
  {
    id: 1,
    title: 'Alpha',
    description: 'Extracts transparency from a dark background or chroma key, or leaves only the color.'
  },
  {
    id: 2,
    title: 'Levels',
    description: 'Remaps the dark and light bounds, like Levels in Photoshop.'
  },
  {
    id: 3,
    title: 'Recolor',
    description: 'Overlays a monochrome, duotone, or tritone treatment on the image.'
  },
  {
    id: 4,
    title: 'Hue & Saturation',
    description: 'Shifts hue, saturation, and lightness across the whole frame.'
  },
  {
    id: 5,
    title: 'Blend',
    description: 'Layers the image on top of itself repeatedly, intensifying color and opacity over several passes.'
  },
  {
    id: 'tiler',
    title: 'Seamless Tile',
    description: 'Shifts the edges with a feathered seam so the texture tiles seamlessly.'
  }
]

// ── Small helpers ──────────────────────────────────────────────────────

interface RgbColor {
  r: number
  g: number
  b: number
}

function hexToRgb(hex: string): RgbColor | null {
  const match = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex)
  if (match === null) return null
  return { r: parseInt(match[1], 16), g: parseInt(match[2], 16), b: parseInt(match[3], 16) }
}

function buildLevelsLUT(levelsMin: number, levelsGamma: number, levelsMax: number): Uint8Array {
  const lut = new Uint8Array(256)
  const range = (levelsMax || 255) - levelsMin
  const invGamma = 1 / (levelsGamma || 1)
  for (let value = 0; value < 256; value += 1) {
    let norm = range > 0 ? (value - levelsMin) / range : 0
    norm = norm < 0 ? 0 : norm > 1 ? 1 : norm
    lut[value] = Math.round(Math.pow(norm, invGamma) * 255)
  }
  return lut
}

function imageDataToCanvas(image: ImageData): OffscreenCanvas {
  const canvas = createCanvas(image.width, image.height)
  getContext2D(canvas).putImageData(image, 0, 0)
  return canvas
}

// ── Node 1 · Alpha Settings + matte choker ───────────────────────────

function applyAlphaStage(data: Uint8ClampedArray, settings: PipelineSettings): void {
  const { colorMode, skipAlpha, threshold, multiply } = settings
  const length = data.length

  if (colorMode === 'black_extract') {
    const threshRange = 255 - threshold
    for (let i = 0; i < length; i += 4) {
      const r = data[i]
      const g = data[i + 1]
      const b = data[i + 2]
      const maxChannel = r > g ? (r > b ? r : b) : g > b ? g : b
      if (maxChannel <= threshold) {
        data[i] = data[i + 1] = data[i + 2] = 0
        if (!skipAlpha) data[i + 3] = 0
      } else {
        let alpha = ((maxChannel - threshold) / threshRange) * 255 * multiply
        if (alpha > 255) alpha = 255
        alpha = alpha | 0
        if (!skipAlpha) data[i + 3] = alpha
        if (alpha > 0) {
          const normAlpha = alpha / 255
          let ur = (r / normAlpha) | 0
          if (ur > 255) ur = 255
          let ug = (g / normAlpha) | 0
          if (ug > 255) ug = 255
          let ub = (b / normAlpha) | 0
          if (ub > 255) ub = 255
          data[i] = ur
          data[i + 1] = ug
          data[i + 2] = ub
        }
      }
    }
  } else if (colorMode === 'chroma_key') {
    const target = hexToRgb(settings.keyerColor) ?? { r: 0, g: 255, b: 0 }
    const tolerance = settings.keyerTolerance
    const fuzziness = settings.keyerFuzziness
    const toleranceFuzz = tolerance + fuzziness
    const invFuzz = fuzziness > 0 ? 255 / fuzziness : 0
    const isGreenKey = target.g > target.r && target.g > target.b

    for (let i = 0; i < length; i += 4) {
      const r = data[i]
      const g = data[i + 1]
      const b = data[i + 2]
      const dr = r - target.r
      const dg = g - target.g
      const db = b - target.b
      const distance = Math.sqrt(dr * dr + dg * dg + db * db)
      let keyAlpha: number
      if (distance < tolerance) keyAlpha = 0
      else if (distance < toleranceFuzz) keyAlpha = ((distance - tolerance) * invFuzz) | 0
      else keyAlpha = 255

      if (keyAlpha < 255 && isGreenKey) {
        const factor = keyAlpha / 255
        data[i + 1] = Math.min(g, ((r + b) * 0.5 * (1 - factor) + g * factor) | 0)
      }
      if (!skipAlpha) {
        const alpha = keyAlpha * multiply
        data[i + 3] = alpha > 255 ? 255 : alpha | 0
      }
    }
  } else if (colorMode === 'grayscale' || colorMode === 'white') {
    const threshRange = 255 - threshold
    for (let i = 0; i < length; i += 4) {
      const r = data[i]
      const g = data[i + 1]
      const b = data[i + 2]
      const luma = (0.299 * r + 0.587 * g + 0.114 * b) | 0
      if (colorMode === 'grayscale') {
        data[i] = data[i + 1] = data[i + 2] = luma
      } else {
        data[i] = data[i + 1] = data[i + 2] = 255
      }
      if (!skipAlpha) {
        if (luma < threshold) {
          data[i + 3] = 0
        } else {
          const alpha = threshRange > 0 ? ((luma - threshold) / threshRange) * 255 * multiply : 0
          data[i + 3] = alpha > 255 ? 255 : alpha | 0
        }
      }
    }
  }
  // colorMode === 'original' — no branch matches, alpha is left untouched.
  // The matte choker (Node 1a) needs width/height, so the orchestrator
  // applies it separately right after this stage — see `runPipeline`.
}

/**
 * Separable two-pass box min/max, replacing the original's single O(r²)
 * pass. A 2D box extremum equals the extremum, over rows, of the
 * per-row extremum over columns — true for any window that never
 * crosses the buffer edge. The source only ever touched pixels whose
 * full (2r+1)×(2r+1) window was in-bounds (its loops start/end at
 * `rAbs`/`dim - rAbs`), so no edge clamping is needed here either: pass
 * 1 computes row-wise extrema at every interior column (that window is
 * always in-bounds regardless of row), pass 2 takes the column-wise
 * extremum of those over every row (always in-bounds regardless of
 * column, since interior rows were required). Result is bit-identical
 * to the original at every pixel it used to touch, in O(n·r) instead of
 * O(n·r²).
 */
function applyChoker(data: Uint8ClampedArray, width: number, height: number, chokeRadius: number): void {
  const rAbs = Math.abs(chokeRadius)
  const isExpand = chokeRadius < 0
  if (width - 2 * rAbs <= 0 || height - 2 * rAbs <= 0) return

  const alpha = new Uint8Array(width * height)
  for (let index = 0; index < alpha.length; index += 1) alpha[index] = data[index * 4 + 3]

  const horizontal = new Uint8Array(width * height)
  for (let y = 0; y < height; y += 1) {
    const rowBase = y * width
    for (let x = rAbs; x < width - rAbs; x += 1) {
      let extrema = isExpand ? 0 : 255
      for (let kx = x - rAbs; kx <= x + rAbs; kx += 1) {
        const value = alpha[rowBase + kx]
        if (isExpand ? value > extrema : value < extrema) extrema = value
      }
      horizontal[rowBase + x] = extrema
    }
  }

  for (let y = rAbs; y < height - rAbs; y += 1) {
    const rowBase = y * width
    for (let x = rAbs; x < width - rAbs; x += 1) {
      let extrema = isExpand ? 0 : 255
      for (let ky = y - rAbs; ky <= y + rAbs; ky += 1) {
        const value = horizontal[ky * width + x]
        if (isExpand ? value > extrema : value < extrema) extrema = value
      }
      data[(rowBase + x) * 4 + 3] = extrema
    }
  }
}

// ── Node 2 · Levels ───────────────────────────────────────────────────

function applyLevelsStage(data: Uint8ClampedArray, settings: PipelineSettings): void {
  const lut = buildLevelsLUT(settings.levelsMin, settings.levelsGamma, settings.levelsMax)
  for (let i = 0; i < data.length; i += 4) {
    data[i] = lut[data[i]]
    data[i + 1] = lut[data[i + 1]]
    data[i + 2] = lut[data[i + 2]]
  }
}

// ── Auto Crop ─────────────────────────────────────────────────────────

function autoCropFrame(image: ImageData): ImageData {
  const { width, height, data } = image
  let minX = width
  let minY = height
  let maxX = -1
  let maxY = -1
  for (let y = 0; y < height; y += 1) {
    const rowBase = y * width
    for (let x = 0; x < width; x += 1) {
      if (data[(rowBase + x) * 4 + 3] > 0) {
        if (x < minX) minX = x
        if (x > maxX) maxX = x
        if (y < minY) minY = y
        if (y > maxY) maxY = y
      }
    }
  }
  if (maxX < 0) return image
  const croppedWidth = maxX - minX + 1
  const croppedHeight = maxY - minY + 1
  if (croppedWidth === width && croppedHeight === height) return image

  const cropped = new ImageData(croppedWidth, croppedHeight)
  for (let y = 0; y < croppedHeight; y += 1) {
    const srcRowStart = ((y + minY) * width + minX) * 4
    const dstRowStart = y * croppedWidth * 4
    cropped.data.set(data.subarray(srcRowStart, srcRowStart + croppedWidth * 4), dstRowStart)
  }
  return cropped
}

// ── Node 3 · Recolor ──────────────────────────────────────────────────

function clampOpacityPercent(percent: number): number {
  return Number.isFinite(percent) ? Math.min(1, Math.max(0, percent / 100)) : 1
}

function applyRecolorStage(data: Uint8ClampedArray, settings: PipelineSettings): void {
  const lightColor = hexToRgb(settings.multiplyColor) ?? { r: 255, g: 255, b: 255 }
  const midColor = hexToRgb(settings.midTintColor) ?? { r: 128, g: 128, b: 128 }
  const darkColor = hexToRgb(settings.darkTintColor) ?? { r: 0, g: 0, b: 0 }
  const balance = settings.tintBalance
  // Each stop's own strength, independent of the others (e.g. light can
  // sit at 100% while dark sits at 40%) — guarded against NaN/undefined
  // for settings persisted before these fields existed, falling back to
  // the old always-100%-strength look.
  const lightOpacity = clampOpacityPercent(settings.multiplyColorOpacity)
  const midOpacity = clampOpacityPercent(settings.midTintColorOpacity)
  const darkOpacity = clampOpacityPercent(settings.darkTintColorOpacity)

  if (settings.blendMode === 'multiply') {
    const lR = lightColor.r / 255
    const lG = lightColor.g / 255
    const lB = lightColor.b / 255
    for (let i = 0; i < data.length; i += 4) {
      const originalR = data[i]
      const originalG = data[i + 1]
      const originalB = data[i + 2]
      data[i] = (originalR + (originalR * lR - originalR) * lightOpacity) | 0
      data[i + 1] = (originalG + (originalG * lG - originalG) * lightOpacity) | 0
      data[i + 2] = (originalB + (originalB * lB - originalB) * lightOpacity) | 0
    }
  } else if (settings.blendMode === 'tritone') {
    const invBalance = 1 / balance
    const invOneMinusBalance = 1 / (1 - balance)
    for (let i = 0; i < data.length; i += 4) {
      const originalR = data[i]
      const originalG = data[i + 1]
      const originalB = data[i + 2]
      const luma = (0.299 * originalR + 0.587 * originalG + 0.114 * originalB) / 255
      // Each stop is first blended toward *this* pixel's own original
      // color by its own opacity, and only then interpolated against
      // its neighbor — so a low-opacity stop never fully overwrites the
      // pixel even at the point where it would otherwise dominate (t=0
      // or t=1), regardless of what opacity the other stop is using.
      let tintedR: number
      let tintedG: number
      let tintedB: number
      if (luma < balance) {
        const t = luma * invBalance
        const effDarkR = originalR + (darkColor.r - originalR) * darkOpacity
        const effDarkG = originalG + (darkColor.g - originalG) * darkOpacity
        const effDarkB = originalB + (darkColor.b - originalB) * darkOpacity
        const effMidR = originalR + (midColor.r - originalR) * midOpacity
        const effMidG = originalG + (midColor.g - originalG) * midOpacity
        const effMidB = originalB + (midColor.b - originalB) * midOpacity
        tintedR = effDarkR * (1 - t) + effMidR * t
        tintedG = effDarkG * (1 - t) + effMidG * t
        tintedB = effDarkB * (1 - t) + effMidB * t
      } else {
        const t = (luma - balance) * invOneMinusBalance
        const effMidR = originalR + (midColor.r - originalR) * midOpacity
        const effMidG = originalG + (midColor.g - originalG) * midOpacity
        const effMidB = originalB + (midColor.b - originalB) * midOpacity
        const effLightR = originalR + (lightColor.r - originalR) * lightOpacity
        const effLightG = originalG + (lightColor.g - originalG) * lightOpacity
        const effLightB = originalB + (lightColor.b - originalB) * lightOpacity
        tintedR = effMidR * (1 - t) + effLightR * t
        tintedG = effMidG * (1 - t) + effLightG * t
        tintedB = effMidB * (1 - t) + effLightB * t
      }
      data[i] = tintedR | 0
      data[i + 1] = tintedG | 0
      data[i + 2] = tintedB | 0
    }
  } else {
    const clampedBalance = balance <= 0 ? 0.0001 : balance >= 1 ? 0.9999 : balance
    const logBalance = Math.log(0.5) / Math.log(clampedBalance)
    for (let i = 0; i < data.length; i += 4) {
      const originalR = data[i]
      const originalG = data[i + 1]
      const originalB = data[i + 2]
      const luma = (0.299 * originalR + 0.587 * originalG + 0.114 * originalB) / 255
      const t = Math.pow(luma, logBalance)
      const effLightR = originalR + (lightColor.r - originalR) * lightOpacity
      const effLightG = originalG + (lightColor.g - originalG) * lightOpacity
      const effLightB = originalB + (lightColor.b - originalB) * lightOpacity
      const effDarkR = originalR + (darkColor.r - originalR) * darkOpacity
      const effDarkG = originalG + (darkColor.g - originalG) * darkOpacity
      const effDarkB = originalB + (darkColor.b - originalB) * darkOpacity
      const tintedR = Math.min(255, Math.max(0, effLightR * t + effDarkR * (1 - t)))
      const tintedG = Math.min(255, Math.max(0, effLightG * t + effDarkG * (1 - t)))
      const tintedB = Math.min(255, Math.max(0, effLightB * t + effDarkB * (1 - t)))
      data[i] = tintedR | 0
      data[i + 1] = tintedG | 0
      data[i + 2] = tintedB | 0
    }
  }
}

// ── Node 5 · Hue / Saturation ─────────────────────────────────────────

function hueToRgbChannel(p: number, q: number, t: number): number {
  let tt = t
  if (tt < 0) tt += 1
  if (tt > 1) tt -= 1
  if (tt < 1 / 6) return p + (q - p) * 6 * tt
  if (tt < 1 / 2) return q
  if (tt < 2 / 3) return p + (q - p) * (2 / 3 - tt) * 6
  return p
}

function applyHueSaturationStage(data: Uint8ClampedArray, settings: PipelineSettings): void {
  const hueShift = settings.hue
  const saturationMultiplier = settings.saturation / 100
  const lightnessMultiplier = settings.lightness / 100

  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] === 0) continue
    let r = data[i] / 255
    let g = data[i + 1] / 255
    let b = data[i + 2] / 255
    const max = r > g ? (r > b ? r : b) : g > b ? g : b
    const min = r < g ? (r < b ? r : b) : g < b ? g : b
    let h: number
    let s: number
    let l = (max + min) / 2
    if (max === min) {
      h = 0
      s = 0
    } else {
      const d = max - min
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
      if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6
      else if (max === g) h = ((b - r) / d + 2) / 6
      else h = ((r - g) / d + 4) / 6
    }
    h = ((h * 360 + hueShift) % 360) / 360
    if (h < 0) h += 1
    s = Math.min(1, s * saturationMultiplier)
    l = Math.min(1, l * lightnessMultiplier)
    if (s === 0) {
      r = g = b = l
    } else {
      const q = l < 0.5 ? l * (1 + s) : l + s - l * s
      const p = 2 * l - q
      r = hueToRgbChannel(p, q, h + 1 / 3)
      g = hueToRgbChannel(p, q, h)
      b = hueToRgbChannel(p, q, h - 1 / 3)
    }
    data[i] = (r * 255) | 0
    data[i + 1] = (g * 255) | 0
    data[i + 2] = (b * 255) | 0
  }
}

// ── Seamless Tiling ───────────────────────────────────────────────────

function tileFrame(image: ImageData, settings: PipelineSettings): ImageData {
  const { width, height } = image
  const sourceCanvas = imageDataToCanvas(image)
  const tileCanvas = createCanvas(width, height)
  const tileContext = getContext2D(tileCanvas)

  const pctX = settings.tilerOffsetX / 100
  const pctY = settings.tilerOffsetY / 100
  const fadePct = settings.tilerFade / 100
  const shiftX = Math.round(width * pctX)
  const shiftY = Math.round(height * pctY)
  const fadeRadiusX = Math.round(width * fadePct)
  const fadeRadiusY = Math.round(height * fadePct)
  const doFadeX = shiftX > 0 && fadeRadiusX > 0
  const doFadeY = shiftY > 0 && fadeRadiusY > 0
  const invFadeRadiusX = doFadeX ? 1 / fadeRadiusX : 0
  const invFadeRadiusY = doFadeY ? 1 / fadeRadiusY : 0

  for (let yo = -1; yo <= 1; yo += 1) {
    for (let xo = -1; xo <= 1; xo += 1) {
      const dx = shiftX + xo * width
      const dy = shiftY + yo * height
      if (dx > -width && dx < width * 2 && dy > -height && dy < height * 2) {
        tileContext.drawImage(sourceCanvas, dx, dy)
      }
    }
  }

  const offsetData = tileContext.getImageData(0, 0, width, height)
  const offset = offsetData.data
  const source = image.data

  for (let y = 0; y < height; y += 1) {
    const distY = doFadeY ? Math.min(y, height - y) : Infinity
    const maskY = doFadeY && distY < fadeRadiusY ? distY * invFadeRadiusY : 1
    const rowBase = y * width
    for (let x = 0; x < width; x += 1) {
      const distX = doFadeX ? Math.min(x, width - x) : Infinity
      const maskX = doFadeX && distX < fadeRadiusX ? distX * invFadeRadiusX : 1
      const maskFactor = maskX * maskY
      if (maskFactor <= 0) continue
      const i = (rowBase + x) * 4
      const originalAlpha = source[i + 3] / 255
      const offsetAlpha = offset[i + 3] / 255
      const topAlpha = originalAlpha * maskFactor
      const outAlpha = topAlpha + offsetAlpha * (1 - topAlpha)
      if (outAlpha > 0) {
        const inv = 1 - topAlpha
        offset[i] = ((source[i] * topAlpha + offset[i] * offsetAlpha * inv) / outAlpha) | 0
        offset[i + 1] = ((source[i + 1] * topAlpha + offset[i + 1] * offsetAlpha * inv) / outAlpha) | 0
        offset[i + 2] = ((source[i + 2] * topAlpha + offset[i + 2] * offsetAlpha * inv) / outAlpha) | 0
        offset[i + 3] = (outAlpha * 255) | 0
      }
    }
  }

  return offsetData
}

// ── Node 6 · Blend Pipeline ───────────────────────────────────────────
// Export mode never had a canvas backdrop to blend onto (that only
// existed for the live preview) — this composites the layer onto a
// blank transparent frame, `layerPower` times over itself.

function applyBlendStage(image: ImageData, settings: PipelineSettings): ImageData {
  const { width, height, data: source } = image
  const target = new ImageData(width, height)
  const targetData = target.data
  const blendMode = settings.layerBlendMode
  const power = settings.layerPower

  for (let i = 0; i < targetData.length; i += 4) {
    let curR = targetData[i]
    let curG = targetData[i + 1]
    let curB = targetData[i + 2]
    let curA = targetData[i + 3] / 255
    const sourceR = source[i]
    const sourceG = source[i + 1]
    const sourceB = source[i + 2]
    const sourceAlpha = source[i + 3] / 255

    if (sourceAlpha === 0) {
      targetData[i] = sourceR
      targetData[i + 1] = sourceG
      targetData[i + 2] = sourceB
      targetData[i + 3] = 0
      continue
    }

    let remainingPower = power
    let accumulatedAlpha = 0

    while (remainingPower > 0) {
      const weight = remainingPower < 1 ? remainingPower : 1
      remainingPower -= weight
      const alpha = sourceAlpha * weight
      if (alpha <= 0) continue

      if (blendMode === 'add' || blendMode === 'screen') {
        accumulatedAlpha = accumulatedAlpha + alpha * (1 - accumulatedAlpha)
      }

      const newAlpha = curA + alpha * (1 - curA)
      if (newAlpha <= 0) continue

      let blendR: number
      let blendG: number
      let blendB: number
      if (blendMode === 'multiply') {
        blendR = (curR * sourceR) / 255
        blendG = (curG * sourceG) / 255
        blendB = (curB * sourceB) / 255
      } else if (blendMode === 'screen') {
        blendR = 255 - ((255 - curR) * (255 - sourceR)) / 255
        blendG = 255 - ((255 - curG) * (255 - sourceG)) / 255
        blendB = 255 - ((255 - curB) * (255 - sourceB)) / 255
      } else {
        blendR = Math.min(255, curR + sourceR)
        blendG = Math.min(255, curG + sourceG)
        blendB = Math.min(255, curB + sourceB)
      }

      const ca1 = curA * (1 - alpha)
      const a1c = alpha * (1 - curA)
      const caa = curA * alpha
      curR = (ca1 * curR + a1c * sourceR + caa * blendR) / newAlpha
      curG = (ca1 * curG + a1c * sourceG + caa * blendG) / newAlpha
      curB = (ca1 * curB + a1c * sourceB + caa * blendB) / newAlpha
      curA = newAlpha
    }

    targetData[i] = curR | 0
    targetData[i + 1] = curG | 0
    targetData[i + 2] = curB | 0
    targetData[i + 3] = blendMode === 'add' || blendMode === 'screen' ? (accumulatedAlpha * 255) | 0 : (sourceAlpha * 255) | 0
  }

  return target
}

// ── Orchestrator ──────────────────────────────────────────────────────
// Stage order mirrors `processCanvas()` exactly. `showStroke` is
// deliberately not applied here — PLAN.md §01 moves it from a baked-in
// effect to a preview-only overlay (Phase 03 UI), matching what the
// original already did for exports (it forced `forceIgnoreStroke` on
// every save).

export function runPipeline(image: ImageData, settings: PipelineSettings, toggles: NodeToggles): ImageData {
  let working = image

  if (toggles[1]) {
    applyAlphaStage(working.data, settings)
    if (settings.colorMode === 'chroma_key' && settings.keyerChoker !== 0) {
      applyChokerOnFrame(working, settings.keyerChoker)
    }
  }
  if (toggles[2]) {
    applyLevelsStage(working.data, settings)
  }
  if (settings.autoCrop) {
    working = autoCropFrame(working)
  }
  if (toggles[3]) {
    applyRecolorStage(working.data, settings)
  }
  if (toggles[4]) {
    applyHueSaturationStage(working.data, settings)
  }
  if (toggles.tiler) {
    working = tileFrame(working, settings)
  }
  if (toggles[5]) {
    working = applyBlendStage(working, settings)
  }

  return working
}

function applyChokerOnFrame(image: ImageData, chokeRadius: number): void {
  applyChoker(image.data, image.width, image.height, chokeRadius)
}
