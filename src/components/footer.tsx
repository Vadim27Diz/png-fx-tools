import { Button } from '@create-figma-plugin/ui'
import { h, JSX } from 'preact'

import { BatchOutcome, BatchProgress } from '../use-batch-apply'
import styles from '../ui.css'

function pluralizeLayers(count: number): string {
  return count === 1 ? 'layer' : 'layers'
}

function describeDownscale(names: string[]): string {
  if (names.length === 0) return ''
  if (names.length === 1) return ` · "${names[0]}" was downscaled to fit 4096 px on the longest side`
  return ` · ${names.length} layers were downscaled to fit 4096 px on the longest side`
}

function describeOutcome(outcome: BatchOutcome): string {
  const total = outcome.succeeded + outcome.failed.length
  const downscaleNote = describeDownscale(outcome.downscaledNames)
  if (outcome.cancelled) {
    return `Cancelled — processed ${outcome.succeeded} of ${total}${downscaleNote}`
  }
  if (outcome.failed.length === 0) {
    return `Done: ${outcome.succeeded} ${pluralizeLayers(outcome.succeeded)}${downscaleNote}`
  }
  const firstFailure = outcome.failed[0]
  const more = outcome.failed.length > 1 ? ` and ${outcome.failed.length - 1} more` : ''
  return `Done: ${outcome.succeeded}. Skipped ${outcome.failed.length}: "${firstFailure.name}" — ${firstFailure.message}${more}${downscaleNote}`
}

interface FooterProps {
  eligibleCount: number
  canApply: boolean
  progress: BatchProgress | null
  lastOutcome: BatchOutcome | null
  onApply: () => void
  onCancel: () => void
}

export function Footer(props: FooterProps): JSX.Element {
  const { eligibleCount, canApply, progress, lastOutcome, onApply, onCancel } = props
  const isRunning = progress !== null
  const applyLabel = eligibleCount <= 1 ? 'Apply' : `Apply to ${eligibleCount} ${pluralizeLayers(eligibleCount)}`

  return (
    <div class={styles.footer}>
      {isRunning && (
        <div class={styles.footerStatusRow}>
          <span class={styles.moduleSummary}>
            Processing "{progress.currentName}" — {progress.done} of {progress.total}
          </span>
        </div>
      )}
      {!isRunning && lastOutcome !== null && (
        <div class={styles.footerStatusRow}>
          <span class={lastOutcome.failed.length > 0 || lastOutcome.cancelled ? styles.footerStatus : styles.moduleSummary}>
            {describeOutcome(lastOutcome)}
          </span>
        </div>
      )}
      <div class={styles.footerControls}>
        <span class={styles.footerSpacer} />
        {isRunning ? (
          <Button secondary onClick={onCancel}>
            Cancel
          </Button>
        ) : (
          <Button disabled={!canApply} onClick={onApply}>
            {applyLabel}
          </Button>
        )}
      </div>
    </div>
  )
}
