import { render, useWindowResize } from '@create-figma-plugin/ui'
import { emit } from '@create-figma-plugin/utilities'
import { h } from 'preact'
import { useCallback } from 'preact/hooks'

import { Footer } from './components/footer'
import { Header } from './components/header'
import { ModuleStack } from './components/module-stack'
import { Preview } from './components/preview'
import { usePluginState } from './state'
import styles from './ui.css'
import { ResizeWindowHandler } from './types'
import { useBatchApply } from './use-batch-apply'
import { useLivePreview } from './use-live-preview'
import { usePipelineWorker } from './use-pipeline-worker'
import { usePresets } from './use-presets'
import { MAX_WINDOW_SIZE, MIN_WINDOW_SIZE } from './window-size'

function Plugin() {
  const state = usePluginState()
  // One shared worker for both live preview and batch Apply (PLAN.md §05
  // Phase 05) — pixel work never runs on the panel's main thread.
  const pipelineWorker = usePipelineWorker()
  const batch = useBatchApply(pipelineWorker)
  const presets = usePresets()

  const bytes = state.previewState.status === 'loaded' ? state.previewState.bytes : undefined
  const mimeType = state.previewState.status === 'loaded' ? state.previewState.mimeType : undefined
  const livePreview = useLivePreview(pipelineWorker, bytes, mimeType, state.settings, state.toggles)

  const handleWindowResize = useCallback(function (size: { width: number; height: number }) {
    emit<ResizeWindowHandler>('RESIZE_WINDOW', size)
  }, [])

  useWindowResize(handleWindowResize, {
    minWidth: MIN_WINDOW_SIZE.width,
    minHeight: MIN_WINDOW_SIZE.height,
    maxWidth: MAX_WINDOW_SIZE.width,
    maxHeight: MAX_WINDOW_SIZE.height,
    resizeBehaviorOnDoubleClick: 'maximize'
  })

  // Applies the current settings to every eligible layer in the
  // selection, not just the one being previewed (PLAN.md §05 Phase 04).
  const handleApply = useCallback(
    function () {
      batch.start(state.selection.eligible, state.settings, state.toggles)
    },
    [batch.start, state.selection.eligible, state.settings, state.toggles]
  )

  const eligibleCount = state.selection.eligible.length
  const canApply = state.previewState.status === 'loaded' && eligibleCount > 0 && !batch.isRunning

  return (
    <div class={styles.shell}>
      <Header selection={state.selection} activeName={state.activeName} />
      <div class={styles.body}>
        <Preview
          status={state.previewState.status}
          errorMessage={state.previewState.status === 'error' ? state.previewState.message : null}
          source={livePreview.source}
          processed={livePreview.processed}
          previewError={livePreview.error}
          checkerboard={state.checkerboard}
          onToggleCheckerboard={state.toggleCheckerboard}
        />
        <ModuleStack
          toggles={state.toggles}
          settings={state.settings}
          openModuleId={state.openModuleId}
          onOpenModule={state.openModule}
          onToggleModule={state.toggleModule}
          onUpdateSetting={state.updateSetting}
          presets={presets.presets}
          onApplyPreset={state.setPipelineState}
          onSavePreset={function (name) {
            presets.save(name, state.settings, state.toggles)
          }}
          onDeletePreset={presets.remove}
        />
      </div>
      <Footer
        eligibleCount={eligibleCount}
        canApply={canApply}
        progress={batch.progress}
        lastOutcome={batch.lastOutcome}
        onApply={handleApply}
        onCancel={batch.cancel}
      />
    </div>
  )
}

export default render(Plugin)
