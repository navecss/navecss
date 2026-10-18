/**
 * AC-native-apply-order-23 (the dev half): a dev server prints a stylesheet's order warnings when
 * their set differs from the last set it printed for that stylesheet, an empty set counting as
 * printed, and maps the position through the incoming source map when Vite supplies one.
 */
import { writeFileSync } from 'node:fs'
import path from 'node:path'
import { createLogger, type ViteDevServer } from 'vite'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { navePlugin } from '../src/vite.ts'
import { occurrences, warningTextsOf } from './helpers/order-warning-vite.ts'
import { APP_FILES } from './helpers/vite-app-files.ts'
import { appConfig, makeApp, type ScratchApp, startDev, stopDev } from './helpers/vite-app.ts'

const FIRST = '.c { @nave hideDesktopUp flex; }\n'
const SECOND = '.e { @nave hideTabletPortraitUp grid; }\n'
const URL = '/src/a.css'

const state = {
  app: undefined as ScratchApp | undefined,
  server: undefined as ViteDevServer | undefined,
  printed: [] as string[],
}

beforeEach(async () => {
  state.printed = []
  state.app = makeApp({
    'index.html': APP_FILES['index.html']!,
    'src/main.js': "import './a.css'\nimport './a.scss'",
    'src/a.css': FIRST,
    'src/a.scss': `$gap: 1px;\n// the rule below is on line 5\n\n\n${FIRST}`,
  })
  const logger = createLogger('silent')
  logger.warn = (message) => {
    state.printed.push(message)
  }
  state.server = await startDev({
    ...appConfig(state.app.root, 'postcss', [navePlugin()], { css: { devSourcemap: true } }),
    customLogger: logger,
  })
})

afterEach(async () => {
  if (state.server) await stopDev(state.server)
  state.app?.dispose()
})

/**
 * Writes `text` to the stylesheet and has the dev server transform it again.
 */
async function save(text: string): Promise<void> {
  writeFileSync(path.join(state.app!.root, 'src/a.css'), text)
  state.server!.environments.client.moduleGraph.invalidateAll()
  await state.server!.transformRequest(URL)
}

/**
 * The warnings printed so far that came from Nave.
 */
function naveWarnings(): string[] {
  return state.printed.filter((message) => message.includes('comes after'))
}

describe('AC-native-apply-order-23 — the dev server', () => {
  it('prints the warning on the first transform, positioned at flex', async () => {
    await state.server!.transformRequest(URL)

    expect(naveWarnings()).toHaveLength(1)
    expect(occurrences(naveWarnings()[0]!, warningTextsOf(FIRST)[0]!)).toBe(1)
    expect(naveWarnings()[0]).toMatch(/a\.css:1:26: @nave: "flex" comes after/)
  }, 60_000)

  it('maps the position through the incoming source map: a Sass rule on line 5 reports src/a.scss:5:26', async () => {
    await state.server!.transformRequest('/src/a.scss')

    expect(naveWarnings()).toHaveLength(1)
    expect(naveWarnings()[0]).toMatch(/a\.scss:5:26: @nave: "flex" comes after/)
    expect(naveWarnings()[0]).not.toContain('as processed')
  }, 60_000)

  it('prints nothing for a save of identical bytes, and the new set when a rule is added', async () => {
    await state.server!.transformRequest(URL)
    await save(FIRST)
    expect(naveWarnings()).toHaveLength(1)

    await save(FIRST + SECOND)
    expect(naveWarnings()).toHaveLength(3)
    expect(naveWarnings().slice(1).join('\n')).toContain(warningTextsOf(SECOND)[0]!)
  }, 60_000)

  it('counts an empty set as printed: remove both rules, then restore the first, and it prints again', async () => {
    await state.server!.transformRequest(URL)
    await save(FIRST + SECOND)
    const afterTwo = naveWarnings().length

    await save('.x { color: red }\n')
    expect(naveWarnings()).toHaveLength(afterTwo)

    await save(FIRST)
    expect(naveWarnings()).toHaveLength(afterTwo + 1)
    expect(naveWarnings().at(-1)).toContain(warningTextsOf(FIRST)[0]!)
  }, 60_000)

  it('the ssr environment transforming the same set prints nothing more', async () => {
    await state.server!.transformRequest(URL)
    await state.server!.environments.ssr.transformRequest(URL)

    expect(naveWarnings()).toHaveLength(1)
  }, 60_000)
})
