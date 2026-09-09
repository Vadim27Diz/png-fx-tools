import { Dropdown, DropdownOption, RangeSlider, Text } from '@create-figma-plugin/ui'
import { h, JSX } from 'preact'

import { LayerBlendMode, PipelineSettings } from '../pipeline'
import styles from '../ui.css'

const LAYER_BLEND_OPTIONS: DropdownOption[] = [
  { value: 'multiply', text: 'Multiply' },
  { value: 'screen', text: 'Screen' },
  { value: 'add', text: 'Linear Add' }
]

interface BlendControlsProps {
  settings: PipelineSettings
  onUpdateSetting: <K extends keyof PipelineSettings>(key: K, value: PipelineSettings[K]) => void
}

export function BlendControls({ settings, onUpdateSetting }: BlendControlsProps): JSX.Element {
  return (
    <div class={styles.controlsStack}>
      <div class={styles.controlRow}>
        <Text>
          <span class={styles.controlLabel}>Mode</span>
        </Text>
        <Dropdown
          options={LAYER_BLEND_OPTIONS}
          value={settings.layerBlendMode}
          onValueChange={function (value) {
            onUpdateSetting('layerBlendMode', value as LayerBlendMode)
          }}
        />
      </div>
      <div class={styles.sliderRow}>
        <Text>
          <span class={styles.controlLabel}>Passes</span>
        </Text>
        <div class={styles.sliderTrack}>
          <RangeSlider
            minimum={1}
            maximum={5}
            increment={0.1}
            value={String(settings.layerPower)}
            onNumericValueInput={function (value) {
              onUpdateSetting('layerPower', value)
            }}
          />
        </div>
        <span class={styles.sliderValue}>{settings.layerPower.toFixed(1)}</span>
      </div>
    </div>
  )
}
