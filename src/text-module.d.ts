// Ambient declaration for the esbuild `text` loader wired in
// `build-figma-plugin.ui.cjs` (PLAN.md §05 Phase 05) — lets `tsc` accept
// `import workerSource from './generated/pipeline-worker-bundle.txt'`
// without needing that generated file to exist at typecheck time.
declare module '*.txt' {
  const content: string
  export default content
}
