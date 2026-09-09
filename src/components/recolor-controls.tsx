import { Dropdown, DropdownOption, RangeSlider, Text, TextboxColor } from '@create-figma-plugin/ui'
import { h, JSX } from 'preact'

import { PipelineSettings, RecolorBlendMode } from '../pipeline'
import styles from '../ui.css'

const BLEND_MODE_OPTIONS: DropdownOption[] = [
  { value: 'multiply', text: 'Multiply' },
  { value: 'tint2color', text: 'Duotone' },
  { value: 'tritone', text: 'Tritone' }
]

interface RecolorControlsProps {
  settings: PipelineSettings
  onUpdateSetting: <K extends keyof PipelineSettings>(key: K, value: PipelineSettings[K]) => void
}

export function RecolorControls({ settings, onUpdateSetting }: RecolorControlsProps): JSX.Element {
  const showMid = settings.blendMode === 'tritone'
  const showDarkAndBalance = settings.blendMode === 'tritone' || settings.blendMode === 'tint2color'
  const lightLabel = settings.blendMode === 'multiply' ? 'Multiply color' : 'Light tone'

  // Each swatch's opacity is independent (e.g. light can sit at 100%
  // while dark sits at 40%), so each gets its own handler writing to its
  // own setting rather than all three sharing one value.
  //
  // TextboxColor's onOpacityNumericValueInput already divides by 100
  // before calling us (see its own handleOpacityNumericValueInput) — it
  // hands us a 0-1 fraction, not the 0-100 percentage typed into the
  // field. The *ColorOpacity settings are stored as that percentage
  // (0-100, to match the `opacity` prop TextboxColor expects back), so
  // this multiplies by 100 to undo the widget's own division. Storing
  // the raw fraction was the earlier bug: it fed straight back into the
  // percentage-string `opacity` prop, so retyping into an
  // already-shrunk field kept dividing by 100 again on every keystroke.
  function makeOpacityHandler<K extends 'multiplyColorOpacity' | 'midTintColorOpacity' | 'darkTintColorOpacity'>(
    key: K
  ): (value: number | null) => void {
    return function (value) {
      if (value === null) return
      onUpdateSetting(key, Math.min(100, Math.max(0, Math.round(value * 100))))
    }
  }

  return (
    <div class={styles.controlsStack}>
      <div class={styles.controlRow}>
        <Text>
          <span class={styles.controlLabel}>Blend</span>
        </Text>
        <Dropdown
          options={BLEND_MODE_OPTIONS}
          value={settings.blendMode}
          onValueChange={function (value) {
            onUpdateSetting('blendMode', value as RecolorBlendMode)
          }}
        />
      </div>
      <div class={styles.controlRow}>
        <Text>
          <span class={styles.controlLabel}>{lightLabel}</span>
        </Text>
        <TextboxColor
          hexColor={settings.multiplyColor}
          opacity={String(settings.multiplyColorOpacity)}
          onHexColorValueInput={function (value) {
            onUpdateSetting('multiplyColor', value)
          }}
          onOpacityNumericValueInput={makeOpacityHandler('multiplyColorOpacity')}
        />
      </div>
      {showMid && (
        <div class={styles.controlRow}>
          <Text>
            <span class={styles.controlLabel}>Mid tone</span>
          </Text>
          <TextboxColor
            hexColor={settings.midTintColor}
            opacity={String(settings.midTintColorOpacity)}
            onHexColorValueInput={function (value) {
              onUpdateSetting('midTintColor', value)
            }}
            onOpacityNumericValueInput={makeOpacityHandler('midTintColorOpacity')}
          />
        </div>
      )}
      {showDarkAndBalance && (
        <div class={styles.controlRow}>
          <Text>
            <span class={styles.controlLabel}>Dark tone</span>
          </Text>
          <TextboxColor
            hexColor={settings.darkTintColor}
            opacity={String(settings.darkTintColorOpacity)}
            onHexColorValueInput={function (value) {
              onUpdateSetting('darkTintColor', value)
            }}
            onOpacityNumericValueInput={makeOpacityHandler('darkTintColorOpacity')}
          />
        </div>
      )}
      {showDarkAndBalance && (
        <div class={styles.sliderRow}>
          <Text>
            <span class={styles.controlLabel}>Balance</span>
          </Text>
          <div class={styles.sliderTrack}>
            <RangeSlider
              minimum={0.05}
              maximum={0.95}
              increment={0.01}
              value={String(settings.tintBalance)}
              onNumericValueInput={function (value) {
                onUpdateSetting('tintBalance', value)
              }}
            />
          </div>
          <span class={styles.sliderValue}>{settings.tintBalance.toFixed(2)}</span>
        </div>
      )}
    </div>
  )
}
