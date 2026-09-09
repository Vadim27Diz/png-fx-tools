import { Dropdown, DropdownOption, IconButton, IconCheck16, IconClose16, IconPlus16, IconTrash24, Textbox } from '@create-figma-plugin/ui'
import { h, JSX } from 'preact'
import { useEffect, useRef, useState } from 'preact/hooks'

import { NodeToggles, PipelineSettings } from '../pipeline'
import { Preset } from '../types'
import styles from '../ui.css'

interface PresetsBarProps {
  presets: Preset[]
  onApply: (settings: PipelineSettings, toggles: NodeToggles) => void
  onSave: (name: string) => void
  onDelete: (id: string) => void
}

const PLACEHOLDER_TEXT = 'Choose a preset…'

/**
 * Named settings bundles saved across every file (PLAN.md §06). Naming a
 * new preset uses an inline textbox rather than `window.prompt` — Figma's
 * plugin UI iframe doesn't run the native prompt/alert/confirm dialogs, so
 * `window.prompt` silently returns without ever showing anything, which
 * made "save preset" a dead button.
 */
export function PresetsBar(props: PresetsBarProps): JSX.Element {
  const { presets, onApply, onSave, onDelete } = props
  const [selectedId, setSelectedId] = useState('')
  const [isNaming, setIsNaming] = useState(false)
  const [draftName, setDraftName] = useState('')
  const nameInputRef = useRef<HTMLInputElement | null>(null)

  useEffect(
    function () {
      if (isNaming) nameInputRef.current?.focus()
    },
    [isNaming]
  )

  function commitName(): void {
    const trimmed = draftName.trim()
    if (trimmed.length > 0) onSave(trimmed)
    setIsNaming(false)
    setDraftName('')
  }

  function cancelName(): void {
    setIsNaming(false)
    setDraftName('')
  }

  if (isNaming) {
    return (
      <div class={styles.presetsBar}>
        <div class={styles.presetsDropdown}>
          <Textbox
            ref={nameInputRef}
            value={draftName}
            placeholder="Preset name"
            onValueInput={setDraftName}
            onKeyDown={function (event: KeyboardEvent) {
              if (event.key === 'Enter') commitName()
              if (event.key === 'Escape') cancelName()
            }}
          />
        </div>
        <IconButton onClick={commitName}>
          <IconCheck16 />
        </IconButton>
        <IconButton onClick={cancelName}>
          <IconClose16 />
        </IconButton>
      </div>
    )
  }

  const options: DropdownOption[] = [
    { value: '', text: presets.length === 0 ? 'No presets yet' : PLACEHOLDER_TEXT },
    ...presets.map(function (preset) {
      return { value: preset.id, text: preset.name }
    })
  ]

  return (
    <div class={styles.presetsBar}>
      <div class={styles.presetsDropdown}>
        <Dropdown
          options={options}
          value={selectedId}
          placeholder={PLACEHOLDER_TEXT}
          onValueChange={function (value) {
            setSelectedId(value)
            const preset = presets.find(function (item) {
              return item.id === value
            })
            if (preset !== undefined) onApply(preset.settings, preset.toggles)
          }}
        />
      </div>
      <IconButton
        onClick={function () {
          setIsNaming(true)
        }}
      >
        <IconPlus16 />
      </IconButton>
      <IconButton
        disabled={selectedId === ''}
        onClick={function () {
          if (selectedId === '') return
          onDelete(selectedId)
          setSelectedId('')
        }}
      >
        <IconTrash24 />
      </IconButton>
    </div>
  )
}
