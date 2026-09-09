import { emit, on } from '@create-figma-plugin/utilities'
import { useEffect, useState } from 'preact/hooks'

import { NodeToggles, PipelineSettings } from './pipeline'
import { DeletePresetHandler, Preset, PresetsChangedHandler, RequestPresetsHandler, SavePresetHandler } from './types'

export interface PresetsApi {
  presets: Preset[]
  save: (name: string, settings: PipelineSettings, toggles: NodeToggles) => void
  remove: (id: string) => void
}

/**
 * Named, whole-pipeline settings bundles stored in `figma.clientStorage`
 * (PLAN.md §06 "Пресеты") — main.ts owns the actual storage, since
 * `clientStorage` only exists in the sandbox; this hook just mirrors its
 * list and emits the three mutating requests. `REQUEST_PRESETS` on mount
 * covers the case where the panel's listener wasn't registered yet for
 * main.ts's own startup broadcast.
 */
export function usePresets(): PresetsApi {
  const [presets, setPresets] = useState<Preset[]>([])

  useEffect(function () {
    const unregister = on<PresetsChangedHandler>('PRESETS_CHANGED', function (payload) {
      setPresets(payload.presets)
    })
    emit<RequestPresetsHandler>('REQUEST_PRESETS')
    return unregister
  }, [])

  return {
    presets,
    save: function (name, settings, toggles) {
      emit<SavePresetHandler>('SAVE_PRESET', { name, settings, toggles })
    },
    remove: function (id) {
      emit<DeletePresetHandler>('DELETE_PRESET', { id })
    }
  }
}
