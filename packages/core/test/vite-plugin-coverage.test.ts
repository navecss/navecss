/**
 * AC-directive-core-32 and AC-directive-core-35: the Vite plugin expands a directive in every
 * kind of stylesheet Vite compiles, in `vite build` and in the dev server, under both
 * `css.transformer` values; and, under Lightning CSS, drops its `Unknown at rule: @nave` warning
 * and no other.
 */
import { createLogger, type Logger, type Plugin } from 'vite'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { navePlugin } from '../src/vite.ts'
import { vue } from './helpers/vite-plugins.ts'
import { APP_FILES, COVERED_SOURCES } from './helpers/vite-app-files.ts'
import {
  appConfig,
  buildOutputs,
  devCss,
  makeApp,
  ruleBodyFor,
  type ScratchApp,
  startDev,
  type Transformer,
  VITE_APIS,
} from './helpers/vite-app.ts'

const TRANSFORMERS: readonly Transformer[] = ['postcss', 'lightningcss']

let app: ScratchApp
beforeAll(() => {
  app = makeApp(APP_FILES)
})
afterAll(() => app?.dispose())

/**
 * The last value `prop` is declared with in `body`: the one that wins the cascade.
 */
function winning(body: string | undefined, prop: string): string | undefined {
  const values = [...(body ?? '').matchAll(new RegExp(`${prop}:\\s*([^;}]+)`, 'g'))]
  return values.at(-1)?.[1]?.trim()
}

function expectCovered(css: string): void {
  for (const [source, name] of Object.entries(COVERED_SOURCES)) {
    expect(ruleBodyFor(css, name), `${source} (.${name}) lost its expansion`).toMatch(
      /display:\s*flex/,
    )
  }
  expect(css).not.toContain('@nave')
  expect(winning(ruleBodyFor(css, 'dispfirst'), 'display')).toBe('flex')
  expect(winning(ruleBodyFor(css, 'displast'), 'display')).toBe('grid')
}

describe.each(Object.entries(VITE_APIS))('Vite %s', (_version, api) => {
  describe('AC-directive-core-32 — coverage, every style source, build and dev, both transformers', () => {
    it.each(TRANSFORMERS)(
      'vite build under css.transformer %s',
      async (transformer) => {
        const { css, js } = await buildOutputs(
          appConfig(app.root, transformer, vue(navePlugin())),
          api,
        )

        expectCovered(`${css}\n${js}`)
      },
      60_000,
    )

    it.each(TRANSFORMERS)(
      'the dev server under css.transformer %s',
      async (transformer) => {
        const server = await startDev(appConfig(app.root, transformer, vue(navePlugin())), api)
        try {
          const served = await devCss(server, '/src/main.js', ['/src/u.css?direct'])

          expectCovered(Object.values(served).join('\n'))
        } finally {
          await server.close()
        }
      },
      60_000,
    )
  })

  describe('a nested rule before a directive, under Lightning CSS at the documented floor', () => {
    const oneSheet = (css: string): ScratchApp =>
      makeApp({
        'index.html': '<script type="module" src="/main.js"></script>',
        'main.js': "import './q.css'",
        'q.css': `${css}\n`,
      })

    it('the last display declaration that applies to the rule is the directive’s', async () => {
      const sheet = oneSheet('.q { &:hover { color: red; } display: grid; @nave flex; }')
      try {
        const { css } = await buildOutputs(
          {
            root: sheet.root,
            configFile: false,
            logLevel: 'silent',
            plugins: [navePlugin()],
            css: {
              transformer: 'lightningcss',
              lightningcss: {
                targets: {
                  chrome: 125 << 16,
                  edge: 125 << 16,
                  firefox: 128 << 16,
                  safari: 18 << 16,
                  ios_saf: 18 << 16,
                },
              },
            },
            build: {
              write: false,
              cssTarget: ['chrome125', 'edge125', 'firefox128', 'safari18', 'ios18'],
            },
          },
          api,
        )
        // At the floor Lightning CSS keeps nesting: drop the nested rules that carry a selector
        // (they do not apply to `.q` unconditionally) and read a bare `&{...}` as `.q`'s own.
        const flat = css.replaceAll(/&[^{};]+\{[^{}]*\}/g, '').replaceAll(/&\{([^{}]*)\}/g, '$1')
        const displays = [...flat.matchAll(/(?:^|\})\.q\{([^}]*)\}/g)].flatMap((rule) =>
          [...rule[1]!.matchAll(/display:([^;}]+)/g)].map((d) => d[1]!.trim()),
        )

        expect(displays.at(-1)).toBe('flex')
      } finally {
        sheet.dispose()
      }
    }, 60_000)
  })

  describe('AC-directive-core-35 — Lightning CSS’s @nave warning is suppressed, and nothing else', () => {
    const FOO = {
      'src/main.js': "import './plain.css'\nimport './foo.css'",
      'src/foo.css': '.f { @foo; }',
    }

    async function captureWarnings(plugins: Plugin[], customLogger?: Logger): Promise<string[]> {
      const warnings: string[] = []
      const scratch = makeApp({ ...APP_FILES, ...FOO })
      try {
        const logger = customLogger ?? createLogger('silent')
        const original = logger.warn
        logger.warn = (message, options) => {
          warnings.push(message)
          original.call(logger, message, options)
        }
        const config = appConfig(scratch.root, 'lightningcss', plugins)
        await buildOutputs({ ...config, customLogger: logger }, api)
        const server = await startDev({ ...config, customLogger: logger }, api)
        try {
          await devCss(server, '/src/main.js')
        } finally {
          await server.close()
        }
      } finally {
        scratch.dispose()
      }
      return warnings
    }

    it('prints no @nave warning and still prints the @foo one, in build and in dev', async () => {
      const warnings = await captureWarnings(vue(navePlugin()))

      expect(warnings.filter((w) => w.includes('Unknown at rule: @nave'))).toEqual([])
      expect(warnings.some((w) => w.includes('Unknown at rule: @foo'))).toBe(true)
    }, 60_000)

    it('control: without the plugin the same fixture does reach the @nave warning', async () => {
      const warnings = await captureWarnings(vue())

      expect(warnings.some((w) => w.includes('Unknown at rule: @nave'))).toBe(true)
    }, 60_000)

    it('with a customLogger passed, the @nave warnings are suppressed and @foo reaches it', async () => {
      const received: string[] = []
      const custom = createLogger('silent')
      custom.warn = (message) => {
        received.push(message)
      }
      const warnings = await captureWarnings(vue(navePlugin()), custom)

      expect(warnings.some((w) => w.includes('Unknown at rule: @nave'))).toBe(false)
      expect(received.some((w) => w.includes('Unknown at rule: @foo'))).toBe(true)
    }, 60_000)

    it('under the default transformer the logger is not wrapped', async () => {
      const seen: unknown[] = []
      const probe = (): Plugin => ({
        name: 'probe',
        configResolved: (config) => {
          seen.push(config.logger.warn)
        },
      })
      const mini = makeApp({
        'index.html': APP_FILES['index.html']!,
        'src/main.js': "import './plain.css'",
        'src/plain.css': '.a { @nave flex; }',
      })
      try {
        await buildOutputs(appConfig(mini.root, 'postcss', [probe(), navePlugin(), probe()]), api)
      } finally {
        mini.dispose()
      }

      expect(seen).toHaveLength(2)
      expect(seen[0]).toBe(seen[1])
    }, 60_000)
  })
})
