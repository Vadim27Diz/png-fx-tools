import { RangeSlider, Text } from '@create-figma-plugin/ui'
import { h, JSX } from 'preact'

import { PipelineSettings } from '../pipeline'
import styles from '../ui.css'

interface HueSaturationControlsProps {
  settings: PipelineSettings
  onUpdateSetting: <K extends keyof PipelineSettings>(key: K, value: PipelineSettings[K]) => void
}

export function HueSaturationControls({ settings, onUpdateSetting }: HueSaturationControlsProps): JSX.Element {
  return (
    <div class={styles.controlsStack}>
      <div class={styles.sliderRow}>
        <Text>
          <span class={styles.controlLabel}>Hue</span>
        </Text>
        <div class={styles.sliderTrack}>
          <RangeSlider
            minimum={0}
            maximum={360}
            value={String(settings.hue)}
            onNumericValueInput={function (value) {
              onUpdateSetting('hue', value)
            }}
          />
        </div>
        <span class={styles.sliderValue}>{settings.hue}°</span>
      </div>
      <div class={styles.sliderRow}>
        <Text>
          <span class={styles.controlLabel}>Saturation</span>
        </Text>
        <div class={styles.sliderTrack}>
          <RangeSlider
            minimum={0}
            maximum={200}
            value={String(settings.saturation)}
            onNumericValueInput={function (value) {
              onUpdateSetting('saturation', value)
            }}
          />
        </div>
        <span class={styles.sliderValue}>{settings.saturation}%</span>
      </div>
      <div class={styles.sliderRow}>
        <Text>
          <span class={styles.controlLabel}>Lightness</span>
        </Text>
        <div class={styles.sliderTrack}>
          <RangeSlider
            minimum={0}
            maximum={200}
            value={String(settings.lightness)}
            onNumericValueInput={function (value) {
              onUpdateSetting('lightness', value)
            }}
          />
        </div>
        <span class={styles.sliderValue}>{settings.lightness}%</span>
      </div>
    </div>
  )
}
