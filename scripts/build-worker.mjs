// One-shot prebuild step, run before `build-figma-plugin` (see the
// "build" script in package.json) — the panel bundle needs
// src/generated/pipeline-worker-bundle.txt to already exist before it can
// inline it.
import { createWorkerBundleContext } from './worker-bundle.mjs'

const context = await createWorkerBundleContext()
const result = await context.rebuild()
await context.dispose()

if (result.errors.length > 0) {
  for (const error of result.errors) {
    console.error(error.text)
  }
  process.exitCode = 1
} else {
  console.log('worker bundle written: src/generated/pipeline-worker-bundle.txt')
}
