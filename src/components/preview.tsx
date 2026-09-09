import { Checkbox, Text } from '@create-figma-plugin/ui'
import { h, JSX } from 'preact'
import { useCallback, useEffect, useRef, useState } from 'preact/hooks'

import styles from '../ui.css'

export type PreviewStatus = 'empty' | 'loading' | 'error' | 'loaded'

interface PreviewProps {
  status: PreviewStatus
  errorMessage: string | null
  source: ImageData | null
  processed: ImageData | null
  previewError: string | null
  checkerboard: boolean
  onToggleCheckerboard: () => void
}

const MIN_ZOOM = 1
const MAX_ZOOM = 4
const ZOOM_STEP = 1.12

export function Preview(props: PreviewProps): JSX.Element {
  const { status, errorMessage, source, processed, previewError, checkerboard, onToggleCheckerboard } = props

  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const isPanning = useRef(false)
  const panOrigin = useRef({ x: 0, y: 0, panX: 0, panY: 0 })

  const [zoom, setZoom] = useState(1)
  const [pan, setPan] = useState({ x: 0, y: 0 })

  // Always show the latest available frame — the freshly processed
  // result once the worker has produced one, the raw decode in the brief
  // gap before that first result arrives.
  const image = processed ?? source

  useEffect(
    function () {
      const canvas = canvasRef.current
      if (canvas === null || image === null) return
      canvas.width = image.width
      canvas.height = image.height
      const context = canvas.getContext('2d')
      if (context !== null) context.putImageData(image, 0, 0)
    },
    [image]
  )

  const resetView = useCallback(function () {
    setZoom(1)
    setPan({ x: 0, y: 0 })
  }, [])

  const handleWheel = useCallback(function (event: WheelEvent) {
    event.preventDefault()
    setZoom(function (current) {
      const next = current * (event.deltaY < 0 ? ZOOM_STEP : 1 / ZOOM_STEP)
      return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, next))
    })
  }, [])

  const handlePointerDown = useCallback(
    function (event: PointerEvent) {
      if (zoom <= 1) return
      isPanning.current = true
      panOrigin.current = { x: event.clientX, y: event.clientY, panX: pan.x, panY: pan.y }
      ;(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId)
    },
    [zoom, pan]
  )

  const handlePointerMove = useCallback(function (event: PointerEvent) {
    if (!isPanning.current) return
    const origin = panOrigin.current
    setPan({ x: origin.panX + (event.clientX - origin.x), y: origin.panY + (event.clientY - origin.y) })
  }, [])

  const handlePointerUp = useCallback(function () {
    isPanning.current = false
  }, [])

  const hasImage = status === 'loaded' && image !== null
  const surfaceClass = checkerboard ? `${styles.previewSurface} ${styles.checkerboard}` : styles.previewSurface
  const isReset = zoom === 1 && pan.x === 0 && pan.y === 0

  return (
    <div class={styles.previewPane}>
      <div
        class={surfaceClass}
        onWheel={hasImage ? handleWheel : undefined}
        onPointerDown={hasImage ? handlePointerDown : undefined}
        onPointerMove={hasImage ? handlePointerMove : undefined}
        onPointerUp={hasImage ? handlePointerUp : undefined}
        onPointerLeave={hasImage ? handlePointerUp : undefined}
        onDblClick={hasImage ? resetView : undefined}
      >
        {status === 'empty' && (
          <Text>
            <span class={styles.previewMessage}>Select a PNG or JPEG image layer on the canvas.</span>
          </Text>
        )}
        {status === 'loading' && (
          <Text>
            <span class={styles.previewMessage}>Loading pixels…</span>
          </Text>
        )}
        {status === 'error' && (
          <Text>
            <span class={styles.footerStatus}>{errorMessage}</span>
          </Text>
        )}
        {status === 'loaded' && image === null && (
          <Text>
            <span class={previewError !== null ? styles.footerStatus : styles.previewMessage}>
              {previewError ?? 'Processing…'}
            </span>
          </Text>
        )}
        {hasImage && (
          <div class={styles.previewStage} style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})` }}>
            <canvas ref={canvasRef} class={styles.previewCanvas} />
          </div>
        )}
      </div>
      <div class={styles.previewToolbar}>
        <Checkbox
          value={checkerboard}
          onValueChange={function () {
            onToggleCheckerboard()
          }}
        >
          <Text>
            <span class={styles.moduleSummary}>Checkerboard</span>
          </Text>
        </Checkbox>
        {hasImage && (
          <div class={styles.zoomControl}>
            <Text>
              <span class={styles.moduleSummary}>{Math.round(zoom * 100)}%</span>
            </Text>
            <button type="button" class={styles.zoomResetButton} disabled={isReset} onClick={resetView}>
              Reset view
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
