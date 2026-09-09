import { Text } from '@create-figma-plugin/ui'
import { h, JSX } from 'preact'

import styles from '../ui.css'
import { SelectionState } from '../types'

interface HeaderProps {
  selection: SelectionState
  activeName: string | null
}

function describeSelection(selection: SelectionState, activeName: string | null): string {
  const { eligible, ineligibleCount } = selection
  if (eligible.length === 0 && ineligibleCount === 0) {
    return 'Nothing selected'
  }
  if (eligible.length === 0) {
    return 'No raster layers — select a PNG or JPEG'
  }
  const image = eligible[0]
  const label = activeName ?? image.name
  const extra = eligible.length > 1 ? ` · +${eligible.length - 1} more` : ''
  const skipped = ineligibleCount > 0 ? ` · ${ineligibleCount} skipped` : ''
  return `${label} · ${image.width}×${image.height}${extra}${skipped}`
}

export function Header({ selection, activeName }: HeaderProps): JSX.Element {
  return (
    <div class={styles.header}>
      <Text>Pixel FX</Text>
      <Text>
        <span class={styles.moduleSummary}>{describeSelection(selection, activeName)}</span>
      </Text>
    </div>
  )
}
