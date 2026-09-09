import { RangeSlider, Text } from '@create-figma-plugin/ui'
import { h, JSX } from 'preact'

import { PipelineSettings } from '../pipeline'
import styles from '../ui.css'

interface LevelsControlsProps {
  settings: PipelineSettings
  onUpdateSetting: <K extends keyof PipelineSettings>(key: K, value: PipelineSettings[K]) => void
}

export function LevelsControls({ settings, onUpdateSetting }: LevelsControlsProps): JSX.Element {
  return (
    <div class={styles.controlsStack}>
      <div class={styles.sliderRow}>
        <Text>
          <span class={styles.controlLabel}>Input min</span>
        </Text>
        <div class={styles.sliderTrack}>
          <RangeSlider
            minimum={0}
            maximum={252}
            value={String(settings.levelsMin)}
            onNumericValueInput={function (value) {
              onUpdateSetting('levelsMin', value)
            }}
          />
        </div>
        <span class={styles.sliderValue}>{settings.levelsMin}</span>
      </div>
      <div class={styles.sliderRow}>
        <Text>
          <span class={styles.controlLabel}>Gamma</span>
        </Text>
        <div class={styles.sliderTrack}>
          <RangeSlider
            minimum={0.1}
            maximum={4}
            increment={0.05}
            value={String(settings.levelsGamma)}
            onNumericValueInput={function (value) {
              onUpdateSetting('levelsGamma', value)
            }}
          />
        </div>
        <span class={styles.sliderValue}>{settings.levelsGamma.toFixed(2)}</span>
      </div>
      <div class={styles.sliderRow}>
        <Text>
          <span class={styles.controlLabel}>Input max</span>
        </Text>
        <div class={styles.sliderTrack}>
          <RangeSlider
            minimum={3}
            maximum={255}
            value={String(settings.levelsMax)}
            onNumericValueInput={function (value) {
              onUpdateSetting('levelsMax', value)
            }}
          />
        </div>
        <span class={styles.sliderValue}>{settings.levelsMax}</span>
      </div>
    </div>
  )
}
