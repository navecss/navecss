/**
 * AC-nextjs-used-atoms-17, on a real `next build` of the newest Next.js on both bundlers:
 * AC-used-atoms-51 (c), a relative `cxModules` entry resolves from the directory holding
 * `next.config`, not from the working directory. The app is `apps/web` of a workspace and `next
 * build apps/web` runs from the workspace top. The floor version is covered by the other real-build
 * files.
 */
import { REPORT_CAUSE } from '@navecss/core/collect'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import type { NextApp, Run } from '../helpers/next-app.ts'

import { createNextApp, SKIP_REASON } from '../helpers/next-app.ts'
import { builtAtoms, BUNDLERS, configText, TIMEOUT } from '../helpers/used-atoms-build.ts'
import { BARREL } from '../helpers/used-atoms-rows.ts'

const FILES = {
  'components/ui/index.js': BARREL,
  'components/a.js': "import { cx } from './ui'\nexport const a = cx('flex')\n",
  'app/page.jsx':
    "import '../components/a.js'\n\nexport default function Page() {\n  return <main />\n}\n",
}

describe.skipIf(SKIP_REASON !== undefined)(
  `AC-used-atoms-51 (c) on a real next build from a workspace top${SKIP_REASON === undefined ? '' : ` (skipped: ${SKIP_REASON})`}`,
  () => {
    describe.each(BUNDLERS)('%s, newest', (_name, flags) => {
      let app: NextApp
      let listed: Run
      let listedAtoms: string[]
      let unlisted: Run
      beforeAll(async () => {
        app = createNextApp(configText({ cxModules: ['./components/ui/index.js'] }))
        app.write(FILES)
        const args = ['build', ...flags, 'apps/web']
        listed = await app.next(args, app.top)
        listedAtoms = builtAtoms(app)
        app.write({ 'next.config.mjs': configText() })
        unlisted = await app.next(args, app.top)
      }, TIMEOUT)
      afterAll(async () => {
        await app.remove()
      })

      it('AC-used-atoms-51 (c): the entry resolves from apps/web, so the build is green with flex collected', () => {
        expect(listed.code, listed.output).toBe(0)
        expect(listed.output).not.toContain(REPORT_CAUSE)
        expect(listedAtoms).toEqual(['flex'])
      })

      it('control: resolved from the working directory, the entry names no file', () => {
        expect(existsSync(path.resolve(app.top, 'components/ui/index.js'))).toBe(false)
        expect(existsSync(path.resolve(app.dir, 'components/ui/index.js'))).toBe(true)
      })

      it('control: without the entry the same barrel fails the build, so the fixture reaches the declared-module rule', () => {
        expect(unlisted.code, unlisted.output).not.toBe(0)
        expect(unlisted.output).toContain(`1 problem in 1 file: ${REPORT_CAUSE}`)
        expect(unlisted.output).toMatch(/^components\/ui\/index\.js:1:1: /mu)
      })
    })
  },
)
