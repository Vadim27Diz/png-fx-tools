import { Dropdown, DropdownOption, RangeSlider, Text, TextboxColor } from '@create-figma-plugin/ui'
import { Fragment, h, JSX } from 'preact'

import { ColorMode, PipelineSettings } from '../pipeline'
import styles from '../ui.css'

const COLOR_MODE_OPTIONS: DropdownOption[] = [
  { value: 'black_extract', text: 'Extract from dark' },
  { value: 'white', text: 'White mask' },
  { value: 'grayscale', text: 'Grayscale' },
  { value: 'chroma_key', text: 'Chroma key' },
  { value: 'original', text: 'Original (alpha only)' }
]

interface AlphaControlsProps {
  settings: PipelineSettings
  onUpdateSetting: <K extends keyof PipelineSettings>(key: K, value: PipelineSettings[K]) => void
}

export function AlphaControls({ settings, onUpdateSetting }: AlphaControlsProps): JSX.Element {
  const showThreshold = settings.colorMode !== 'chroma_key' && settings.colorMode !== 'original'
  const showMultiply = settings.colorMode !== 'original'
  const showChroma = settings.colorMode === 'chroma_key'

  return (
    <div class={styles.controlsStack}>
      <div class={styles.controlRow}>
        <Text>
          <span class={styles.controlLabel}>Mode</span>
        </Text>
        <Dropdown
          options={COLOR_MODE_OPTIONS}
          value={settings.colorMode}
          onValueChange={function (value) {
            onUpdateSetting('colorMode', value as ColorMode)
          }}
        />
      </div>

      {showThreshold && (
        <div class={styles.sliderRow}>
          <Text>
            <span class={styles.controlLabel}>Threshold</span>
          </Text>
          <div class={styles.sliderTrack}>
            <RangeSlider
              minimum={0}
              maximum={255}
              value={String(settings.threshold)}
              onNumericValueInput={function (value) {
                onUpdateSetting('threshold', value)
              }}
            />
          </div>
          <span class={styles.sliderValue}>{settings.threshold}</span>
        </div>
      )}

      {showMultiply && (
        <div class={styles.sliderRow}>
          <Text>
            <span class={styles.controlLabel}>Power α</span>
          </Text>
          <div class={styles.sliderTrack}>
            <RangeSlider
              minimum={1}
              maximum={10}
              increment={0.1}
              value={String(settings.multiply)}
              onNumericValueInput={function (value) {
                onUpdateSetting('multiply', value)
              }}
            />
          </div>
          <span class={styles.sliderValue}>{settings.multiply.toFixed(1)}</span>
        </div>
      )}

      {showChroma && (
        <Fragment>
          <div class={styles.controlRow}>
            <Text>
              <span class={styles.controlLabel}>Key color</span>
            </Text>
            <TextboxColor
              hexColor={settings.keyerColor}
              opacity="100"
              onHexColorValueInput={function (value) {
                onUpdateSetting('keyerColor', value)
              }}
            />
          </div>
          <div class={styles.sliderRow}>
            <Text>
              <span class={styles.controlLabel}>Tolerance</span>
            </Text>
            <div class={styles.sliderTrack}>
              <RangeSlider
                minimum={0}
                maximum={200}
                value={String(settings.keyerTolerance)}
                onNumericValueInput={function (value) {
                  onUpdateSetting('keyerTolerance', value)
                }}
              />
            </div>
            <span class={styles.sliderValue}>{settings.keyerTolerance}</span>
          </div>
          <div class={styles.sliderRow}>
            <Text>
              <span class={styles.controlLabel}>Softness</span>
            </Text>
            <div class={styles.sliderTrack}>
              <RangeSlider
                minimum={1}
                maximum={150}
                value={String(settings.keyerFuzziness)}
                onNumericValueInput={function (value) {
                  onUpdateSetting('keyerFuzziness', value)
                }}
              />
            </div>
            <span class={styles.sliderValue}>{settings.keyerFuzziness}</span>
          </div>
          <div class={styles.sliderRow}>
            <Text>
              <span class={styles.controlLabel}>Choker</span>
            </Text>
            <div class={styles.sliderTrack}>
              <RangeSlider
                minimum={-10}
                maximum={10}
                value={String(settings.keyerChoker)}
                onNumericValueInput={function (value) {
                  onUpdateSetting('keyerChoker', value)
                }}
              />
            </div>
            <span class={styles.sliderValue}>{settings.keyerChoker}</span>
          </div>
        </Fragment>
      )}
    </div>
  )
}
