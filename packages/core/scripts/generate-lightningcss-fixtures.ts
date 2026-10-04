/**
 * Generates the CSS the Lightning CSS adapter's real-browser fixture needs, GITIGNORED and
 * regenerated before every `test:browser` run (never committed, same treatment as `dist/` and
 * the other generated fixtures beside it).
 *
 * Node-only, deliberately: a browser test cannot run Lightning CSS. This runs the adapter's
 * `expand` and Lightning CSS's `transform()` on the oldest supported release and on the newest
 * installed one, and hands the browser test the printed CSS through a `?raw` import, so the page
 * it injects it into is judged against what Lightning CSS actually printed.
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { navePlugin } from '../src/lightningcss.ts'
import { LIGHTNING_RELEASES } from '../test/helpers/lightningcss-releases.ts'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const FIXTURES_DIR = path.resolve(HERE, '../test/browser/fixtures')

const SOURCE = '.o { display: grid; @nave flex; }\n.p { @nave flex; display: grid; }\n'

mkdirSync(FIXTURES_DIR, { recursive: true })
for (const { lib, package: name } of LIGHTNING_RELEASES) {
  const expanded = navePlugin().expand(SOURCE, 'app.css')
  const { code } = lib.transform({
    filename: 'app.css',
    code: expanded.code,
    inputSourceMap: expanded.map,
  })
  writeFileSync(path.join(FIXTURES_DIR, `${name}.css`), code)
}
console.log('✓ Generated the Lightning CSS fixtures in test/browser/fixtures/')
