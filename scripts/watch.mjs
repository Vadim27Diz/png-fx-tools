// `npm run watch` — keeps the worker bundle (src/pipeline-worker.ts) and
// the panel/sandbox bundle (build-figma-plugin's own watch mode) both
// live-rebuilding from one command, since a Figma dev-mode reload always
// re-reads both build/main.js and build/ui.js together.
import { spawn } from 'node:child_process'
import { createWorkerBundleContext } from './worker-bundle.mjs'

const context = await createWorkerBundleContext()
const initial = await context.rebuild()
if (initial.errors.length > 0) {
  for (const error of initial.errors) console.error(error.text)
  process.exitCode = 1
} else {
  console.log('[worker] watching src/pipeline-worker.ts')
}
await context.watch()

const child = spawn('build-figma-plugin', ['--typecheck', '--watch'], {
  stdio: 'inherit',
  shell: process.platform === 'win32'
})

let shuttingDown = false
async function shutdown(code) {
  if (shuttingDown) return
  shuttingDown = true
  await context.dispose()
  child.kill()
  process.exit(code ?? 0)
}

process.on('SIGINT', function () {
  void shutdown(0)
})
process.on('SIGTERM', function () {
  void shutdown(0)
})
child.on('exit', function (code) {
  void shutdown(code ?? 0)
})
