import { Checkbox, Text } from '@create-figma-plugin/ui'
import { h, JSX } from 'preact'

import { PipelineSettings } from '../pipeline'
import styles from '../ui.css'

interface UtilitiesPanelProps {
  settings: PipelineSettings
  onUpdateSetting: <K extends keyof PipelineSettings>(key: K, value: PipelineSettings[K]) => void
}

// Mirrors PNG_FX_Tools.html's "Pipeline Utilities" node: unlike the
// numbered modules, these aren't behind their own enable switch — the
// original always applied them (skipAlpha/autoCrop are read
// unconditionally in processCanvas, only the numbered nodes are gated).
export function UtilitiesPanel({ settings, onUpdateSetting }: UtilitiesPanelProps): JSX.Element {
  return (
    <div class={styles.utilitiesPanel}>
      <Checkbox
        value={settings.skipAlpha}
        onValueChange={function (value) {
          onUpdateSetting('skipAlpha', value)
        }}
      >
        <Text>Leave alpha untouched</Text>
      </Checkbox>
      <Checkbox
        value={settings.autoCrop}
        onValueChange={function (value) {
          onUpdateSetting('autoCrop', value)
        }}
      >
        <Text>Crop transparent edges</Text>
      </Checkbox>
    </div>
  )
}
