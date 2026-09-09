// Bundles src/pipeline-worker.ts standalone into
// src/generated/pipeline-worker-bundle.{js,txt} (PLAN.md §05 Phase 05).
// It has to be bundled separately from the panel's own esbuild pass
// (run by @create-figma-plugin/build) because a Worker needs its own
// complete, self-executing script — it can't just be `require`d into the
// panel bundle like every other module. The .txt copy is what the panel
// bundle actually imports (via the `text` loader in
// build-figma-plugin.ui.cjs), inlined as a string and turned into a
// Worker at runtime through a Blob URL (see use-pipeline-worker.ts).
import * as esbuild from 'esbuild'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ENTRY = resolve(__dirname, '../src/pipeline-worker.ts')
const OUT_DIR = resolve(__dirname, '../src/generated')
const OUT_JS = resolve(OUT_DIR, 'pipeline-worker-bundle.js')
const OUT_TXT = resolve(OUT_DIR, 'pipeline-worker-bundle.txt')

async function copyAsText() {
  const contents = await readFile(OUT_JS, 'utf8')
  await writeFile(OUT_TXT, contents, 'utf8')
}

export async function createWorkerBundleContext() {
  await mkdir(OUT_DIR, { recursive: true })
  return esbuild.context({
    entryPoints: [ENTRY],
    bundle: true,
    format: 'iife',
    platform: 'browser',
    target: 'chrome58',
    minify: true,
    outfile: OUT_JS,
    logLevel: 'silent',
    plugins: [
      {
        name: 'emit-as-text-module',
        setup(build) {
          build.onEnd(async function (result) {
            if (result.errors.length > 0) return
            await copyAsText()
          })
        }
      }
    ]
  })
}
