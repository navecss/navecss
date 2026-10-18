/**
 * Generates the CSS the Lightning CSS default-targets browser test renders, GITIGNORED and
 * regenerated before every `test:browser` run (never committed, same treatment as `dist/` and the
 * other generated fixtures beside it).
 *
 * Node-only, deliberately: a browser test cannot run `vite build`. This builds a one-stylesheet
 * app with the real plugin under `css.transformer: 'lightningcss'` at Vite's DEFAULT targets (no
 * floor keys), where Lightning CSS moves a rule's content after a directive into later rules
 * before the directive is expanded, and hands the browser test the resulting CSS text.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from 'vite'

import { navePlugin } from '../src/vite.ts'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const FIXTURES_DIR = path.resolve(HERE, '../test/browser/fixtures')

const SOURCE = `.c1 { @nave hideDesktopUp; display: grid }
.c2 { @nave hideDesktopUp flex; }
.d3 { @nave hideDesktopUp; color: red; @nave flex; }
.f3 { @nave focusRing; &:focus { outline: none } }
`

const root = mkdtempSync(path.join(HERE, '..', '.nave-vite-lightningcss-'))
try {
  mkdirSync(path.join(root, 'src'))
  writeFileSync(
    path.join(root, 'index.html'),
    '<!doctype html><script type="module" src="/src/main.js"></script>',
  )
  writeFileSync(path.join(root, 'src/main.js'), "import './app.css'")
  writeFileSync(path.join(root, 'src/app.css'), SOURCE)
  const result = await build({
    root,
    cacheDir: path.join(root, '.vite'),
    configFile: false,
    logLevel: 'silent',
    plugins: [navePlugin()],
    css: { transformer: 'lightningcss' },
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
  if (css.trim() === '') throw new Error('the Vite build wrote no CSS, so there is no fixture')
  mkdirSync(FIXTURES_DIR, { recursive: true })
  writeFileSync(path.join(FIXTURES_DIR, 'vite-lightningcss-default-targets.css'), css, 'utf8')
} finally {
  rmSync(root, { force: true, recursive: true })
}
