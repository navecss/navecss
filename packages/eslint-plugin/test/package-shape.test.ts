/**
 * AC-eslint-plugin-01 covers: R1.
 * AC-eslint-plugin-02 covers: R1.
 * AC-eslint-plugin-04 covers: R1 (the ESLint trademark notice, cleared and signed off).
 */
import { Linter } from 'eslint'
import { defineConfig } from 'eslint/config'
import { execFileSync, spawnSync } from 'node:child_process'
import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { describe, expect, it } from 'vitest'

import { PUBLISHABLE_SET } from '../../../scripts/check-publishable-set.mjs'
import { packTarball } from './helpers/pack.ts'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const PACKAGE_DIR = path.resolve(HERE, '..')
const ROOT = path.resolve(HERE, '../../..')

function manifest(): Record<string, unknown> {
  return JSON.parse(readFileSync(path.join(PACKAGE_DIR, 'package.json'), 'utf8')) as Record<
    string,
    unknown
  >
}

interface Changeset {
  readonly id: string
  readonly releases: readonly { readonly name: string; readonly type: string }[]
}

async function readPendingChangesets(rootDir: string): Promise<Changeset[]> {
  const fromRoot = createRequire(path.join(ROOT, 'package.json'))
  const fromCli = createRequire(fromRoot.resolve('@changesets/cli/package.json'))
  const reader = (await import(pathToFileURL(fromCli.resolve('@changesets/read')).href)) as {
    readChangesets: (cwd: string) => Promise<Changeset[]>
  }
  return reader.readChangesets(rootDir)
}

describe('AC-01: the package manifest', () => {
  it('type: module, license: MIT, no bin, build runs only tsc', () => {
    const m = manifest() as {
      bin?: unknown
      license: string
      scripts: Record<string, string>
      type: string
    }
    expect(m.type).toBe('module')
    expect(m.license).toBe('MIT')
    expect(m.bin).toBeUndefined()
    expect(m.scripts.build).toBe('tsc -p tsconfig.build.json')
  })

  it('peerDependencies is exactly eslint and @navecss/core, neither optional; dependencies is exactly postcss-value-parser', () => {
    const m = manifest() as {
      dependencies: Record<string, string>
      peerDependencies: Record<string, string>
      peerDependenciesMeta?: Record<string, { optional?: boolean }>
    }
    expect(Object.keys(m.peerDependencies).toSorted((a, b) => a.localeCompare(b))).toEqual([
      '@navecss/core',
      'eslint',
    ])
    expect(m.peerDependencies.eslint).toBe('^9.24.0 || ^10.0.0')
    expect(m.peerDependencies['@navecss/core']).toBe('>=0.1.0 <1.0.0')
    expect(m.peerDependenciesMeta?.eslint?.optional).not.toBe(true)
    expect(m.peerDependenciesMeta?.['@navecss/core']?.optional).not.toBe(true)
    expect(Object.keys(m.dependencies)).toEqual(['postcss-value-parser'])
  })

  it('@navecss/core appears in no field other than peerDependencies and devDependencies; no field names @navecss/tokens, stylelint, the stylelint config, @eslint/css or @typescript-eslint/parser', () => {
    const m = manifest() as {
      dependencies?: Record<string, string>
      devDependencies?: Record<string, string>
      peerDependencies?: Record<string, string>
    }
    expect(m.dependencies).not.toHaveProperty('@navecss/core')
    const forbidden = [
      '@navecss/tokens',
      'stylelint',
      '@navecss/stylelint-config',
      '@eslint/css',
      '@typescript-eslint/parser',
    ]
    for (const field of [m.dependencies, m.peerDependencies, m.devDependencies]) {
      for (const name of forbidden) {
        expect(Object.keys(field ?? {})).not.toContain(name)
      }
    }
  })

  it('no peer range is a caret on a 0.x version', () => {
    const m = manifest() as { peerDependencies: Record<string, string> }
    for (const range of Object.values(m.peerDependencies)) {
      expect(range.startsWith('^0')).toBe(false)
    }
  })

  it('exports has no require condition', () => {
    const m = manifest() as { exports: Record<string, unknown> }
    const conditionKeys = Object.values(m.exports).flatMap((value) =>
      typeof value === 'object' && value !== null
        ? Object.keys(value as Record<string, unknown>)
        : [],
    )
    expect(conditionKeys).not.toContain('require')
  })

  it('no preinstall, install, postinstall or prepare script', () => {
    const m = manifest() as { scripts: Record<string, string> }
    for (const name of ['preinstall', 'install', 'postinstall', 'prepare']) {
      expect(m.scripts[name]).toBeUndefined()
    }
  })

  it('check:pack and prepublishOnly exist in the siblings shape', () => {
    const m = manifest() as { scripts: Record<string, string> }
    expect(m.scripts['check:pack']).toContain('publint')
    expect(m.scripts['check:pack']).toContain('attw')
    expect(m.scripts.prepublishOnly).toContain('check-no-orphaned-chunks')
    expect(m.scripts.prepublishOnly).toContain('check:pack')
  })

  it('LICENSE is byte-identical to the root LICENSE', () => {
    const rootLicense = readFileSync(path.join(ROOT, 'LICENSE'), 'utf8')
    const packageLicense = readFileSync(path.join(PACKAGE_DIR, 'LICENSE'), 'utf8')
    expect(packageLicense).toBe(rootLicense)
  })

  it('PUBLISHABLE_SET contains @navecss/eslint-plugin, and check-publishable-set passes', () => {
    expect(PUBLISHABLE_SET.has('@navecss/eslint-plugin')).toBe(true)
    expect(() =>
      execFileSync('node', [path.join(ROOT, 'scripts/check-publishable-set.mjs')], {
        cwd: ROOT,
        encoding: 'utf8',
      }),
    ).not.toThrow()
  })

  it('.changeset/config.json names the package in none of fixed, linked and ignore (standing)', () => {
    const config = JSON.parse(readFileSync(path.join(ROOT, '.changeset/config.json'), 'utf8')) as {
      fixed: string[][]
      ignore: string[]
      linked: string[][]
    }
    expect(config.fixed.flat()).not.toContain('@navecss/eslint-plugin')
    expect(config.linked.flat()).not.toContain('@navecss/eslint-plugin')
    expect(config.ignore).not.toContain('@navecss/eslint-plugin')
  })

  it('a minor changeset naming only this package is pending, and the next version is 0.1.0', async () => {
    const { version } = manifest() as { version: string }
    expect(version).toBe('0.0.0')
    const pending = await readPendingChangesets(ROOT)
    const naming = pending.filter((changeset) =>
      changeset.releases.some((release) => release.name === '@navecss/eslint-plugin'),
    )
    expect(naming).toHaveLength(1)
    expect(naming[0]!.releases).toEqual([{ name: '@navecss/eslint-plugin', type: 'minor' }])
  })
})

interface PluginShape {
  configs: { recommended: { plugins?: unknown; rules: Record<string, string> } }
  meta: { namespace: string; version: string }
  rules: Record<string, unknown>
}

async function loadPlugin(): Promise<PluginShape> {
  const imported = await import('../src/index.ts')
  return imported.default as unknown as PluginShape
}

describe('AC-02: the plugin object', () => {
  it('meta.version equals the manifest version', async () => {
    const plugin = await loadPlugin()
    expect(plugin.meta.version).toBe((manifest() as { version: string }).version)
  })

  it('meta.namespace is @navecss; rules and configs.recommended exist', async () => {
    const plugin = await loadPlugin()
    expect(plugin.meta.namespace).toBe('@navecss')
    expect(Object.keys(plugin.rules).toSorted((a, b) => a.localeCompare(b))).toEqual([
      'class-channel',
      'count-escapes',
      'raw-reason',
      'style-values',
    ])
    expect(plugin.configs.recommended).toBeTruthy()
  })

  it('configs.recommended sets rules only — no languageOptions, files, settings or processor', async () => {
    const plugin = await loadPlugin()
    const keys = Object.keys(plugin.configs.recommended).toSorted((a, b) => a.localeCompare(b))
    expect(keys).toEqual(['plugins', 'rules'])
  })

  it('recommended registers this very plugin object under the key @navecss, and no other', async () => {
    const plugin = await loadPlugin()
    const { plugins } = plugin.configs.recommended as { plugins: Record<string, unknown> }
    expect(Object.keys(plugins)).toEqual(['@navecss'])
    expect(plugins['@navecss']).toBe(plugin)
  })

  it.each([
    ['defineConfig([recommended])', (recommended: Linter.Config) => [recommended]],
    [
      'defineConfig([{ extends: [recommended] }])',
      (recommended: Linter.Config) => [{ extends: [recommended] }],
    ],
    [
      "extends: ['@navecss/recommended'] with the plugin registered",
      (recommended: Linter.Config) => [
        { plugins: recommended.plugins, extends: ['@navecss/recommended'] },
      ],
    ],
  ])('%s reports a literal class under @navecss/class-channel', async (_form, configsFor) => {
    const plugin = (await loadPlugin()) as unknown as { configs: { recommended: Linter.Config } }
    const config = defineConfig([
      ...(configsFor(plugin.configs.recommended) as Parameters<typeof defineConfig>),
      { languageOptions: { parserOptions: { ecmaFeatures: { jsx: true } } } },
    ])
    const messages = new Linter().verify('const el = <div className="legacy-card" />', config, {
      filename: 'app.js',
    })
    expect(messages.map((message) => message.ruleId)).toEqual(['@navecss/class-channel'])
  })

  it('recommended sets the four rules to error, except count-escapes which is off', async () => {
    const plugin = await loadPlugin()
    const { rules } = plugin.configs.recommended
    expect(rules['@navecss/class-channel']).toBe('error')
    expect(rules['@navecss/raw-reason']).toBe('error')
    expect(rules['@navecss/style-values']).toBe('error')
    expect(rules['@navecss/count-escapes']).toBe('off')
  })
})

describe('AC-04: the ESLint trademark notice', () => {
  const NOTICE =
    'ESLint® is a registered trademark of the OpenJS Foundation. This package is not affiliated with or endorsed by the OpenJS Foundation or the ESLint project.'

  it('the README contains the notice, byte-exact, as one line', () => {
    const readme = readFileSync(path.join(PACKAGE_DIR, 'README.md'), 'utf8')
    const lines = readme.split('\n')
    expect(lines).toContain(NOTICE)
  })

  it("the first occurrence of ESLint in the README's prose is written ESLint®", () => {
    const readme = readFileSync(path.join(PACKAGE_DIR, 'README.md'), 'utf8')
    const withoutCode = readme.replaceAll(/```[\s\S]*?```/g, '').replaceAll(/`[^`]*`/g, '')
    const index = withoutCode.indexOf('ESLint')
    expect(index).toBeGreaterThan(-1)
    expect(withoutCode.slice(index, index + 7)).toBe('ESLint®')
  })

  it('no sentence puts the mark before Nave/NaveCSS', () => {
    const readme = readFileSync(path.join(PACKAGE_DIR, 'README.md'), 'utf8')
    expect(readme).not.toMatch(/ESLint®?\s+(Nave|NaveCSS)/)
  })

  it('the tarball contains no image file and the README embeds none', () => {
    const tarball = packTarball()
    for (const file of tarball.files) {
      expect(/\.(png|jpe?g|gif|svg|webp)$/i.test(file)).toBe(false)
    }
    const readme = readFileSync(path.join(PACKAGE_DIR, 'README.md'), 'utf8')
    expect(readme).not.toMatch(/!\[|<img/)
  })
})

describe('the packed tarball itself', () => {
  it('carries package/LICENSE, package/README.md, package/dist/index.js, package/dist/index.d.ts', () => {
    const tarball = packTarball()
    for (const file of [
      'package/LICENSE',
      'package/README.md',
      'package/dist/index.js',
      'package/dist/index.d.ts',
    ]) {
      expect(tarball.files).toContain(file)
    }
  })
})

/**
 * Installs the packed tarball into a scratch consumer's `node_modules` by name, next to the one
 * runtime dependency but with no `@navecss/core`, the state a package manager that does not
 * install peers leaves behind.
 */
function scratchConsumerWithoutCore(): string {
  const dir = mkdtempSync(path.join(tmpdir(), 'nave-eslint-plugin-consumer-'))
  const scope = path.join(dir, 'node_modules/@navecss')
  mkdirSync(scope, { recursive: true })
  cpSync(packTarball().root, path.join(scope, 'eslint-plugin'), { recursive: true })
  const valueParser = realpathSync(path.join(PACKAGE_DIR, 'node_modules/postcss-value-parser'))
  symlinkSync(valueParser, path.join(dir, 'node_modules/postcss-value-parser'), 'dir')
  return dir
}

/**
 * The scratch consumer above with the workspace's own `@navecss/core` beside the plugin, so
 * `require()` and `import()` resolve the package through its export map exactly as a consumer's
 * `eslint.config.cjs` or `eslint.config.js` would.
 */
function scratchConsumer(): string {
  const dir = scratchConsumerWithoutCore()
  symlinkSync(path.join(ROOT, 'packages/core'), path.join(dir, 'node_modules/@navecss/core'), 'dir')
  return dir
}

function runNode(cwd: string, args: string[]): { output: string; status: number | null } {
  const result = spawnSync(process.execPath, args, { cwd, encoding: 'utf8' })
  return { status: result.status, output: `${result.stdout}${result.stderr}` }
}

const PRINT_RULES = 'console.log(Object.keys(plugin.rules).sort().join(","))'
const PRINT_VERSION = 'console.log(`version=${plugin.meta.version}`)'
const RULE_LIST = 'class-channel,count-escapes,raw-reason,style-values'

describe('loading the installed package by name', () => {
  it('require() loads it: an export-map default condition, and no top-level await in its module graph', () => {
    const dir = scratchConsumer()
    try {
      const run = runNode(dir, [
        '-e',
        `const plugin = require('@navecss/eslint-plugin').default; ${PRINT_RULES}`,
      ])
      expect(run.output).toContain(RULE_LIST)
      expect(run.status).toBe(0)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it("the README's own eslint.config.cjs line, run as written by the ESLint CLI, loads the plugin and reports", () => {
    const readme = readFileSync(path.join(PACKAGE_DIR, 'README.md'), 'utf8')
    const statement = /`(const nave = require\('@navecss\/eslint-plugin'\)[^`]*)`/u.exec(
      readme.replaceAll(/\s+/gu, ' '),
    )?.[1]
    expect(statement, 'the README shows the require() line').toBeDefined()
    const dir = scratchConsumer()
    try {
      writeFileSync(
        path.join(dir, 'eslint.config.cjs'),
        `${statement}\nmodule.exports = [nave.configs.recommended]\n`,
      )
      writeFileSync(
        path.join(dir, 'a.js'),
        "import { cx } from '@navecss/core/cx'\nexport const k = cx.raw('legacy-card')\n",
      )
      const eslintBin = path.join(ROOT, 'node_modules/eslint/bin/eslint.js')
      const run = runNode(dir, [eslintBin, 'a.js'])
      expect(run.output).toContain('@navecss/raw-reason')
      expect(run.status).toBe(1)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('import() loads it', () => {
    const dir = scratchConsumer()
    try {
      const run = runNode(dir, [
        '--input-type=module',
        '-e',
        `const { default: plugin } = await import('@navecss/eslint-plugin'); ${PRINT_RULES}`,
      ])
      expect(run.output).toContain(RULE_LIST)
      expect(run.status).toBe(0)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})

describe('loading the installed package with its @navecss/core peer missing', () => {
  const PRINT_MESSAGE = 'console.log(`message=${error.message}`)'

  it.each([
    [
      'import()',
      [
        '--input-type=module',
        '-e',
        `try { await import('@navecss/eslint-plugin') } catch (error) { ${PRINT_MESSAGE} }`,
      ],
    ],
    [
      'require()',
      ['-e', `try { require('@navecss/eslint-plugin') } catch (error) { ${PRINT_MESSAGE} }`],
    ],
  ])(
    '%s fails with an error naming the missing peer and its range, and no path inside the plugin',
    (_form, args) => {
      const { peerDependencies } = manifest() as { peerDependencies: Record<string, string> }
      const dir = scratchConsumerWithoutCore()
      try {
        const run = runNode(dir, args)
        const message = run.output.split('\n').find((line) => line.startsWith('message='))
        expect(message).toBe(
          `message=@navecss/eslint-plugin needs its peer dependency @navecss/core (${peerDependencies['@navecss/core']}) installed.`,
        )
      } finally {
        rmSync(dir, { recursive: true, force: true })
      }
    },
  )
})

describe('AC-02: meta.version is read from the manifest, never typed by hand', () => {
  it('the installed package reports its packed manifest version, and a copy whose manifest version alone changed reports the changed one', () => {
    const dir = scratchConsumer()
    try {
      const manifestPath = path.join(dir, 'node_modules/@navecss/eslint-plugin/package.json')
      const packed = JSON.parse(readFileSync(manifestPath, 'utf8')) as { version: string }
      const load = [
        '--input-type=module',
        '-e',
        `const { default: plugin } = await import('@navecss/eslint-plugin'); ${PRINT_VERSION}`,
      ]
      expect(runNode(dir, load).output).toContain(`version=${packed.version}`)

      writeFileSync(manifestPath, JSON.stringify({ ...packed, version: '9.8.7-changed' }))
      expect(runNode(dir, load).output).toContain('version=9.8.7-changed')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
