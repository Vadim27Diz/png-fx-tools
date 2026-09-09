import { RangeSlider, Text } from '@create-figma-plugin/ui'
import { h, JSX } from 'preact'

import { PipelineSettings } from '../pipeline'
import styles from '../ui.css'

interface TilerControlsProps {
  settings: PipelineSettings
  onUpdateSetting: <K extends keyof PipelineSettings>(key: K, value: PipelineSettings[K]) => void
}

export function TilerControls({ settings, onUpdateSetting }: TilerControlsProps): JSX.Element {
  return (
    <div class={styles.controlsStack}>
      <div class={styles.sliderRow}>
        <Text>
          <span class={styles.controlLabel}>Offset X</span>
        </Text>
        <div class={styles.sliderTrack}>
          <RangeSlider
            minimum={0}
            maximum={100}
            value={String(settings.tilerOffsetX)}
            onNumericValueInput={function (value) {
              onUpdateSetting('tilerOffsetX', value)
            }}
          />
        </div>
        <span class={styles.sliderValue}>{settings.tilerOffsetX}%</span>
      </div>
      <div class={styles.sliderRow}>
        <Text>
          <span class={styles.controlLabel}>Offset Y</span>
        </Text>
        <div class={styles.sliderTrack}>
          <RangeSlider
            minimum={0}
            maximum={100}
            value={String(settings.tilerOffsetY)}
            onNumericValueInput={function (value) {
              onUpdateSetting('tilerOffsetY', value)
            }}
          />
        </div>
        <span class={styles.sliderValue}>{settings.tilerOffsetY}%</span>
      </div>
      <div class={styles.sliderRow}>
        <Text>
          <span class={styles.controlLabel}>Seam feather</span>
        </Text>
        <div class={styles.sliderTrack}>
          <RangeSlider
            minimum={1}
            maximum={50}
            value={String(settings.tilerFade)}
            onNumericValueInput={function (value) {
              onUpdateSetting('tilerFade', value)
            }}
          />
        </div>
        <span class={styles.sliderValue}>{settings.tilerFade}%</span>
      </div>
    </div>
  )
}
