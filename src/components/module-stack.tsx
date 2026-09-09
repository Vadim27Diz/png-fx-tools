import { Checkbox, IconChevronDown16, IconChevronRight16, Text } from '@create-figma-plugin/ui'
import { h, JSX } from 'preact'

import { MODULES, ModuleId, NodeToggles, PipelineSettings } from '../pipeline'
import { Preset } from '../types'
import styles from '../ui.css'
import { AlphaControls } from './alpha-controls'
import { BlendControls } from './blend-controls'
import { HueSaturationControls } from './hue-saturation-controls'
import { LevelsControls } from './levels-controls'
import { PresetsBar } from './presets-bar'
import { RecolorControls } from './recolor-controls'
import { TilerControls } from './tiler-controls'
import { UtilitiesPanel } from './utilities-panel'

interface ModuleStackProps {
  toggles: NodeToggles
  settings: PipelineSettings
  openModuleId: ModuleId | null
  onOpenModule: (id: ModuleId | null) => void
  onToggleModule: (id: ModuleId) => void
  onUpdateSetting: <K extends keyof PipelineSettings>(key: K, value: PipelineSettings[K]) => void
  presets: Preset[]
  onApplyPreset: (settings: PipelineSettings, toggles: NodeToggles) => void
  onSavePreset: (name: string) => void
  onDeletePreset: (id: string) => void
}

export function ModuleStack(props: ModuleStackProps): JSX.Element {
  const {
    toggles,
    settings,
    openModuleId,
    onOpenModule,
    onToggleModule,
    onUpdateSetting,
    presets,
    onApplyPreset,
    onSavePreset,
    onDeletePreset
  } = props

  function renderControls(id: ModuleId): JSX.Element {
    switch (id) {
      case 1:
        return <AlphaControls settings={settings} onUpdateSetting={onUpdateSetting} />
      case 2:
        return <LevelsControls settings={settings} onUpdateSetting={onUpdateSetting} />
      case 3:
        return <RecolorControls settings={settings} onUpdateSetting={onUpdateSetting} />
      case 4:
        return <HueSaturationControls settings={settings} onUpdateSetting={onUpdateSetting} />
      case 5:
        return <BlendControls settings={settings} onUpdateSetting={onUpdateSetting} />
      case 'tiler':
        return <TilerControls settings={settings} onUpdateSetting={onUpdateSetting} />
      default:
        return <div />
    }
  }

  return (
    <div class={styles.settingsPane}>
      <PresetsBar presets={presets} onApply={onApplyPreset} onSave={onSavePreset} onDelete={onDeletePreset} />
      {MODULES.map(function (module) {
        const enabled = toggles[module.id]
        const isOpen = openModuleId === module.id

        return (
          <div class={styles.moduleRow} key={String(module.id)}>
            <div class={styles.moduleHeader}>
              <Checkbox
                value={enabled}
                onValueChange={function () {
                  onToggleModule(module.id)
                }}
              >
                {''}
              </Checkbox>
              <button
                type="button"
                class={styles.moduleTitleButton}
                onClick={function () {
                  const opening = !isOpen
                  onOpenModule(opening ? module.id : null)
                  // Opening a module to configure it should turn it on —
                  // the enable checkbox and the expand arrow used to be
                  // fully independent, which meant dialing in settings on
                  // a collapsed-off module silently did nothing.
                  if (opening && !enabled) {
                    onToggleModule(module.id)
                  }
                }}
              >
                <Text>{module.title}</Text>
                {isOpen ? <IconChevronDown16 /> : <IconChevronRight16 />}
              </button>
            </div>
            {isOpen && (
              <div class={styles.moduleBody}>
                <div class={styles.moduleDescriptionRow}>
                  <Text>
                    <span class={styles.moduleDescription}>{module.description}</span>
                  </Text>
                </div>
                {renderControls(module.id)}
              </div>
            )}
          </div>
        )
      })}
      <UtilitiesPanel settings={settings} onUpdateSetting={onUpdateSetting} />
    </div>
  )
}
