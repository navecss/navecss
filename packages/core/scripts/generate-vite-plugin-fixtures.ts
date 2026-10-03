/**
 * Generates the CSS the Vite plugin's real-browser fixture needs, GITIGNORED and regenerated
 * before every `test` and `test:browser` run (never committed, same treatment as `dist/` and the
 * consumer-theming fixtures beside it).
 *
 * Node-only, deliberately: a browser test cannot run `vite build`. This builds a one-stylesheet
 * app with the real plugin at Vite's DEFAULT targets (no floor keys, which is what a project
 * that has set none gets) and hands the browser test the resulting CSS text through a `?raw`
 * import, so the page it injects it into is judged against what the build actually emitted.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from 'vite'

import { navePlugin } from '../src/vite.ts'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const FIXTURES_DIR = path.resolve(HERE, '../test/browser/fixtures')

const root = mkdtempSync(path.join(HERE, '..', '.nave-vite-fixture-'))
try {
  mkdirSync(path.join(root, 'src'))
  writeFileSync(
    path.join(root, 'index.html'),
    '<!doctype html><script type="module" src="/src/main.js"></script>',
  )
  writeFileSync(path.join(root, 'src/main.js'), "import './app.css'")
  writeFileSync(
    path.join(root, 'src/app.css'),
    '.o { display: grid; @nave flex; }\n.p { @nave flex; display: grid; }\n',
  )
  const result = await build({
    root,
    cacheDir: path.join(root, '.vite'),
    configFile: false,
    logLevel: 'silent',
    plugins: [navePlugin()],
    build: { write: false },
  })
  const outputs = (Array.isArray(result) ? result : [result]) as unknown as {
    output: { fileName: string; source?: string }[]
  }[]
  const css = outputs
    .flatMap((o) => o.output)
    .filter((o) => o.fileName.endsWith('.css'))
    .map((o) => o.source)
    .join('\n')
  if (css.trim() === '')
    throw new Error('the Vite build wrote no CSS, so there is no fixture to write')
  mkdirSync(FIXTURES_DIR, { recursive: true })
  writeFileSync(path.join(FIXTURES_DIR, 'vite-plugin-default-targets.css'), css, 'utf8')
  console.log('✓ Generated the Vite plugin fixture in test/browser/fixtures/')
} finally {
  rmSync(root, { force: true, recursive: true })
}
