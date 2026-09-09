// Picked up automatically by `@create-figma-plugin/build` (glob
// `build-figma-plugin.ui.{cjs,js}` — see its `overrideEsbuildConfigAsync`).
// Adds the `text` loader so `use-pipeline-worker.ts` can
// `import workerSource from './generated/pipeline-worker-bundle.txt'` and
// get the worker's bundled source back as a plain string, instead of
// esbuild trying to parse that already-minified JS as this bundle's own
// code (PLAN.md §05 Phase 05).
module.exports = function (esbuildConfig) {
  return {
    ...esbuildConfig,
    loader: {
      ...esbuildConfig.loader,
      '.txt': 'text'
    }
  }
}
