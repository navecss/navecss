/**
 * AC-directive-core-17 and AC-directive-core-16 through a real Vite: a problem is reported under the
 * file Vite passed, with a note that the position is as processed, when Vite supplies no source map
 * (a default build); at the authored file and line when it does (the dev server with
 * `css.devSourcemap`); and two stylesheets with one problem each are two failing modules.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { navePlugin } from '../src/vite.ts'
import { APP_FILES } from './helpers/vite-app-files.ts'
import { appConfig, buildOutputs, makeApp, type ScratchApp, startDev } from './helpers/vite-app.ts'

const FILES = {
  'index.html': APP_FILES['index.html']!,
  'src/main.js': "import './entry.css'\nimport './s3.scss'",
  'src/entry.css': "@import './card.css';\n.entry { color: red; }\n",
  'src/card.css': '.card {\n  color: blue;\n  @nave nope;\n}\n',
  'src/s3.scss': '$gap: 1px;\n.box {\n  padding: $gap;\n  @nave nope;\n}\n',
}

let app: ScratchApp
beforeAll(() => {
  app = makeApp(FILES)
})
afterAll(() => app.dispose())

async function messageOf(run: Promise<unknown>): Promise<string> {
  try {
    await run
  } catch (error) {
    return (error as Error).message
  }
  throw new Error('expected a failure and got none')
}

describe('AC-directive-core-17 — whose line and column, through Vite', () => {
  it('a default build, with no stylesheet map, reports the file Vite passed and says so', async () => {
    const message = await messageOf(buildOutputs(appConfig(app.root, 'postcss', [navePlugin()])))

    expect(message).toContain('[plugin nave]')
    expect(message).toMatch(/entry\.css:\d+:\d+: @nave: unknown atom "nope"/)
    expect(message).toMatch(/\(position in \S+entry\.css as processed; no source map\)/)
  }, 30_000)

  it('the dev server with css.devSourcemap reports an @import-reached file at its authored line', async () => {
    const server = await startDev(
      appConfig(app.root, 'postcss', [navePlugin()], { css: { devSourcemap: true } }),
    )
    try {
      const message = await messageOf(server.transformRequest('/src/entry.css'))

      expect(message).toMatch(/card\.css:3:\d+: @nave: unknown atom "nope"/)
      expect(message).not.toContain('no source map')
    } finally {
      await server.close()
    }
  }, 30_000)

  it('a Sass file reports the .scss line when Vite supplies a map', async () => {
    const server = await startDev(
      appConfig(app.root, 'postcss', [navePlugin()], { css: { devSourcemap: true } }),
    )
    try {
      const message = await messageOf(server.transformRequest('/src/s3.scss'))

      expect(message).toMatch(/s3\.scss:4:\d+: @nave: unknown atom "nope"/)
    } finally {
      await server.close()
    }
  }, 30_000)

  it('without devSourcemap the dev server says the position is as processed', async () => {
    const server = await startDev(appConfig(app.root, 'postcss', [navePlugin()]))
    try {
      const message = await messageOf(server.transformRequest('/src/s3.scss'))

      expect(message).toContain('as processed; no source map')
    } finally {
      await server.close()
    }
  }, 30_000)
})

describe('AC-directive-core-16 — the fold is per stylesheet, so two stylesheets are two failing modules', () => {
  it('each stylesheet is its own error in the dev server', async () => {
    const server = await startDev(appConfig(app.root, 'postcss', [navePlugin()]))
    try {
      const first = await messageOf(server.transformRequest('/src/card.css'))
      const second = await messageOf(server.transformRequest('/src/s3.scss'))

      expect(first).toContain('card.css')
      expect(second).toContain('s3.scss')
      expect(first).not.toContain('s3.scss')
    } finally {
      await server.close()
    }
  }, 30_000)
})
