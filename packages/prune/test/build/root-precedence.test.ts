/**
 * A config that sets both `outputFileTracingRoot` and `turbopack.root`, on a real Turbopack build:
 * Next.js builds from `outputFileTracingRoot` (and warns), so the plugin declares files within it.
 * An `extend` module outside it is then left undeclared, where declaring it would stop the build
 * with Turbopack's internal error.
 */
import { mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

import type { NextApp } from '../helpers/next-app.ts'

import { createNextApp, SKIP_REASON } from '../helpers/next-app.ts'
import { PACKAGE_ROOT } from '../helpers/next-process.ts'

const TIMEOUT = 900_000
const WORKSPACE = path.resolve(PACKAGE_ROOT, '../..')

const apps: NextApp[] = []
const scratch: string[] = []
afterEach(async () => {
  for (const app of apps) await app.remove()
  for (const dir of scratch) rmSync(dir, { recursive: true, force: true })
  apps.length = 0
  scratch.length = 0
})

const GLOBALS = [
  "@import url('@navecss/core/layers');",
  "@import url('@navecss/core');",
  '',
  '.card {',
  '  @nave brandBox;',
  '}',
  '',
].join('\n')

/**
 * An `extend` module in the system's temporary directory, outside the workspace.
 */
function outsideAtoms(): string {
  const made = mkdtempSync(path.join(tmpdir(), 'prune-atoms-'))
  const dir = realpathSync(made)
  scratch.push(dir)
  const file = path.join(dir, 'atoms.mjs')
  const map = { brandBox: { declarations: { 'outline-offset': '7px' } } }
  writeFileSync(file, `export default ${JSON.stringify(map)}\n`)
  return file
}

describe.skipIf(SKIP_REASON !== undefined)(
  `the root a config sets twice, on a real Turbopack build${SKIP_REASON === undefined ? '' : ` (skipped: ${SKIP_REASON})`}`,
  () => {
    it.each([
      ['both outputFileTracingRoot and a wider turbopack.root', `turbopack: { root: '/' }, `],
      ['control: only outputFileTracingRoot', ''],
    ])(
      '%s: an extend module outside the workspace builds',
      async (_case, turbopack) => {
        const atoms = outsideAtoms()
        const roots = `${turbopack}outputFileTracingRoot: ${JSON.stringify(WORKSPACE)}`
        const config = `import { withNave } from '@navecss/prune'\n\nexport default withNave({ ${roots} }, { extend: ${JSON.stringify(atoms)} })\n`
        const app = createNextApp(config)
        apps.push(app)
        app.write({ 'app/globals.css': GLOBALS })
        const run = await app.next(['build'])
        expect(run.code, run.output).toBe(0)
        expect(/\.card\s*\{([^}]*)\}/.exec(app.builtCss())?.[1] ?? '').toContain('7px')
      },
      TIMEOUT,
    )
  },
)
