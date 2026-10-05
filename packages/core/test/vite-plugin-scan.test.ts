/**
 * AC-directive-core-33: the build fails when a directive reaches emitted CSS, with the same lines
 * `navecss-core check` prints for the same content, and nothing turns the scan off.
 */
import type { Plugin } from 'vite'

import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { check } from '../src/directive/check.ts'
import { formatFinding } from '../src/directive/findings.ts'
import { navePlugin, type NaveViteOptions } from '../src/vite.ts'
import { APP_FILES } from './helpers/vite-app-files.ts'
import { appConfig, buildOutputs, makeApp, type ScratchApp, VITE_APIS } from './helpers/vite-app.ts'

const ON_UNKNOWN = ['error', 'warn', 'ignore'] as const

let clean: ScratchApp
let valueSurvivor: ScratchApp
beforeAll(() => {
  const entry = { 'index.html': APP_FILES['index.html']!, 'src/main.js': "import './plain.css'" }
  // eslint-disable-next-line unicorn/no-top-level-assignment-in-function -- the setup hook builds the apps the suite shares; a hook cannot return them
  clean = makeApp({ ...entry, 'src/plain.css': '.a { @nave flex; }' })
  // eslint-disable-next-line unicorn/no-top-level-assignment-in-function -- the setup hook builds the apps the suite shares; a hook cannot return them
  valueSurvivor = makeApp({ ...entry, 'src/plain.css': '.a { color: @nave flex; }' })
})
afterAll(() => {
  clean?.dispose()
  valueSurvivor?.dispose()
})

/**
 * A plugin listed before the Nave one that emits a stylesheet holding a directive from
 * `generateBundle`, past anything the transform sees.
 */
function emitSurvivor(): Plugin {
  return {
    name: 'emit-survivor',
    generateBundle() {
      // eslint-disable-next-line unicorn/no-this-outside-of-class -- a Rollup hook receives its plugin context as `this`
      this.emitFile({ type: 'asset', fileName: 'x.css', source: '.b{@nave flex}' })
    },
  }
}

/**
 * A plugin that emits a stylesheet holding a directive from a post-ordered `generateBundle`, the
 * same phase the scan runs in.
 */
const emitterAt = (name: string): Plugin => ({
  name,
  generateBundle: {
    order: 'post',
    handler() {
      // eslint-disable-next-line unicorn/no-this-outside-of-class -- a Rollup hook receives its plugin context as `this`
      this.emitFile({ type: 'asset', fileName: 'late.css', source: '.b{@nave flex}' })
    },
  },
})

async function failureOf(run: Promise<unknown>): Promise<Error> {
  try {
    await run
  } catch (error) {
    return error as Error
  }
  throw new Error('the build was expected to fail and passed')
}

/**
 * What `navecss-core check` prints for `css` written to `asset`, as the lines after the file label.
 */
async function checkLinesFor(asset: string, css: string): Promise<string[]> {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'nave-scan-'))
  try {
    writeFileSync(path.join(dir, asset), css)
    const result = await check({ source: [dir] })
    return result.findings.map((f) => formatFinding(f).slice(path.join(dir, asset).length))
  } finally {
    rmSync(dir, { force: true, recursive: true })
  }
}

describe.each(Object.entries(VITE_APIS))('Vite %s', (_version, api) => {
  describe('AC-directive-core-33 — the build fails when a directive reaches emitted CSS', () => {
    describe.each(ON_UNKNOWN)('under onUnknown %s', (onUnknown) => {
      const options: NaveViteOptions = { onUnknown }

      it('(a) fails on a directive the expander leaves in a declaration value', async () => {
        const config = appConfig(valueSurvivor.root, 'postcss', [navePlugin(options)])
        const error = await failureOf(buildOutputs(config, api))

        expect(error.message).toContain('[plugin nave]')
        expect(error.message).toMatch(/assets\/[\w.-]+\.css:1:\d+: @nave flex \(in \.a\)/)
        expect(error.message).toMatch(/Scanned 1 CSS asset this build wrote\./)
      }, 30_000)

      it('(b) fails on a stylesheet another plugin emits at the very end, and prints check’s own lines', async () => {
        const config = appConfig(clean.root, 'postcss', [emitSurvivor(), navePlugin(options)])
        const error = await failureOf(buildOutputs(config, api))

        expect(error.message).toContain('[plugin nave]')
        const [expected] = await checkLinesFor('x.css', '.b{@nave flex}')
        expect(expected).toBe(':1:4: @nave flex (in .b)')
        expect(error.message).toContain(`x.css${expected}`)
        expect(error.message).toMatch(/Scanned \d+ CSS assets? this build wrote\./)
      }, 30_000)
    })

    it('(b) also fails under css.transformer lightningcss', async () => {
      const config = appConfig(clean.root, 'lightningcss', [emitSurvivor(), navePlugin()])
      const error = await failureOf(buildOutputs(config, api))

      expect(error.message).toContain('x.css:1:4: @nave flex (in .b)')
    }, 30_000)

    it('a CSS file a plugin listed before the Nave one emits from a post-ordered generateBundle fails the build', async () => {
      const config = appConfig(clean.root, 'postcss', [emitterAt('early'), navePlugin()], {
        build: { write: true },
      })
      const error = await failureOf(buildOutputs(config, api))

      expect(error.message).toContain('late.css:1:4: @nave flex (in .b)')
    }, 60_000)

    it('the count line states how many CSS assets the build wrote', async () => {
      const config = appConfig(clean.root, 'postcss', [emitSurvivor(), navePlugin()])
      const error = await failureOf(buildOutputs(config, api))
      const plain = await buildOutputs(appConfig(clean.root, 'postcss', [navePlugin()]), api)
      const written = plain.css.length

      expect(written).toBeGreaterThan(0)
      expect(error.message).toMatch(/Scanned 2 CSS assets this build wrote\./)
    }, 30_000)

    it('with no survivor the build passes and the scan prints nothing', async () => {
      const warnings: string[] = []
      const config = {
        ...appConfig(clean.root, 'postcss', [navePlugin()]),
        customLogger: {
          info() {},
          warn: (m: string) => void warnings.push(m),
          warnOnce: (m: string) => void warnings.push(m),
          error: (m: string) => void warnings.push(m),
          clearScreen() {},
          hasErrorLogged: () => false,
          hasWarned: false,
        },
      }
      const { css } = await buildOutputs(config, api)

      expect(css).toContain('display:flex')
      expect(warnings).toEqual([])
    }, 30_000)

    it('no option turns the scan off: the options type has no such key', () => {
      // @ts-expect-error — there is no scan switch at first publish
      const off: NaveViteOptions = { scan: false }

      expect(off).toBeDefined()
    })
  })
})
