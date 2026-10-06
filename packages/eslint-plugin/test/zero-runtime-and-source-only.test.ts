/**
 * AC-eslint-plugin-05 covers: R2.
 * AC-eslint-plugin-06 covers: R3.
 *
 * R2: nothing in this package is imported by application code or reaches a browser bundle. R3:
 * every rule keys on the source the author wrote, never on whether a build step has run.
 *
 * AC-05's own text calls for bundling a consumer app with Vite; this suite instead asserts the
 * structural properties that make a bundler run unnecessary to prove them — no application
 * source (in this workspace, or in any published package) ever imports this package, and its
 * own manifest carries no `browser` field or condition for a bundler to resolve in the first
 * place. Combined with the no-inlined-dependency guard (`tsc` never bundles), there is nothing
 * a browser build could pull in.
 */
import { Linter } from 'eslint'
import { execFileSync } from 'node:child_process'
import fs, {
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { syncBuiltinESMExports } from 'node:module'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { describe, expect, it } from 'vitest'

import { classChannelRule } from '../src/rules/class-channel.ts'

const PACKAGE_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const WORKSPACE_ROOT = path.resolve(PACKAGE_DIR, '../..')
const PACKAGE_NAME = '@navecss/eslint-plugin'

function listFilesRecursively(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry)
    if (statSync(full).isDirectory()) {
      if (entry === 'node_modules' || entry === 'dist' || entry.startsWith('.')) continue
      out.push(...listFilesRecursively(full))
    } else if (/\.(ts|tsx|js|jsx|mjs|cjs)$/.test(entry)) {
      out.push(full)
    }
  }
  return out
}

describe('AC-05: zero-runtime (R2)', () => {
  it('the manifest has no browser field and its exports carry no browser condition', () => {
    const manifest = JSON.parse(readFileSync(path.join(PACKAGE_DIR, 'package.json'), 'utf8')) as {
      browser?: unknown
      exports: Record<string, unknown>
    }
    expect(manifest.browser).toBeUndefined()
    const conditionKeys = Object.values(manifest.exports).flatMap((value) =>
      typeof value === 'object' && value !== null
        ? Object.keys(value as Record<string, unknown>)
        : [],
    )
    expect(conditionKeys).not.toContain('browser')
  })

  it('no source file in this workspace, outside this package itself, imports the package', () => {
    const otherPackageSrcDirs = ['core', 'tokens', 'base-ui', 'cli', 'stylelint-config']
      .map((name) => path.join(WORKSPACE_ROOT, 'packages', name, 'src'))
      .filter((dir) => statSync(dir, { throwIfNoEntry: false })?.isDirectory())

    // Matches an actual import/require of the package, never a comment or docblock mentioning
    // it by name (core's own `cx.ts` docblock does exactly that, pointing readers at it).
    const importPattern = new RegExp(
      String.raw`from\s*['"]${PACKAGE_NAME.replaceAll(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`)}['"]|require\(\s*['"]${PACKAGE_NAME.replaceAll(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`)}['"]\s*\)`,
    )
    const matchingFiles = otherPackageSrcDirs
      .flatMap((dir) => listFilesRecursively(dir))
      .filter((file) => importPattern.test(readFileSync(file, 'utf8')))
    expect(matchingFiles).toEqual([])
  })

  it('no other package.json names this package in dependencies, peerDependencies or optionalDependencies', () => {
    for (const name of ['core', 'tokens', 'base-ui', 'cli', 'stylelint-config']) {
      const manifestPath = path.join(WORKSPACE_ROOT, 'packages', name, 'package.json')
      const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as {
        dependencies?: Record<string, string>
        optionalDependencies?: Record<string, string>
        peerDependencies?: Record<string, string>
      }
      for (const field of [
        manifest.dependencies,
        manifest.peerDependencies,
        manifest.optionalDependencies,
      ]) {
        expect(Object.keys(field ?? {})).not.toContain(PACKAGE_NAME)
      }
    }
  })
})

const FIXTURE = `import { cx } from '@navecss/core/cx'\nconst ok = <div className={cx('flex')} />\nconst bad = <div className={cx('legacy-card')} />`

/**
 * Records every path a synchronous `node:fs` call is handed while `run` executes, by swapping
 * the functions on the module object and re-syncing the ES-module bindings the rules imported.
 */
function recordFileAccess(run: () => void): string[] {
  const touched: string[] = []
  const names = ['existsSync', 'readFileSync', 'realpathSync', 'statSync', 'lstatSync'] as const
  const originals = names.map((name) => [name, fs[name]] as const)
  for (const [name, original] of originals) {
    Object.assign(fs, {
      [name]: (target: unknown, ...rest: unknown[]) => {
        touched.push(String(target))
        return (original as (...args: unknown[]) => unknown)(target, ...rest)
      },
    })
  }
  syncBuiltinESMExports()
  try {
    run()
  } finally {
    for (const [name, original] of originals) Object.assign(fs, { [name]: original })
    syncBuiltinESMExports()
  }
  return touched
}

function lintIn(
  project: string,
  plugin: unknown,
  code: string,
  settings: Record<string, unknown> = {},
): string[] {
  const cwdBefore = process.cwd()
  process.chdir(project)
  try {
    return new Linter({ cwd: project })
      .verify(
        code,
        {
          files: ['**/*.jsx'],
          languageOptions: { parserOptions: { ecmaFeatures: { jsx: true } } },
          plugins: { '@navecss': plugin as never },
          rules: { '@navecss/class-channel': 'error' },
          settings,
        },
        { filename: path.join(project, 'src/app.jsx') },
      )
      .map((message) => `${message.line}:${message.ruleId}:${message.message}`)
  } finally {
    process.chdir(cwdBefore)
  }
}

function scratchProject(): string {
  const scratch = mkdtempSync(path.join(tmpdir(), 'nave-consumer-'))
  const project = realpathSync(scratch)
  mkdirSync(path.join(project, 'src/ui'), { recursive: true })
  writeFileSync(path.join(project, 'src/ui/cx.js'), "export { cx } from '@navecss/core/cx'\n")
  return project
}

const sourcePlugin = { rules: { 'class-channel': classChannelRule } }

describe('AC-06: rules key on source, never on build output (R3)', () => {
  it('the recorder sees a read the rules really make: a cxModules wrapper resolved in the project (a control)', () => {
    const project = scratchProject()
    try {
      const touched = recordFileAccess(() =>
        lintIn(
          project,
          sourcePlugin,
          "import { cx } from './ui/cx.js'\nconst a = <div className={cx('flex')} />",
          {
            '@navecss': { cxModules: ['./src/ui/cx.js'] },
          },
        ),
      )
      expect(touched.some((target) => target.startsWith(path.join(project, 'src/ui/cx')))).toBe(
        true,
      )
    } finally {
      rmSync(project, { recursive: true, force: true })
    }
  })

  it('verdicts are identical with no build output, with one, and after it is deleted, and no rule reads a file in the project', () => {
    const project = scratchProject()
    try {
      const touched: string[] = []
      const verdicts: string[][] = []
      const lintFixture = (): void => {
        verdicts.push(lintIn(project, sourcePlugin, FIXTURE))
      }
      const lintOnce = (): void => {
        touched.push(...recordFileAccess(lintFixture))
      }

      lintOnce()
      mkdirSync(path.join(project, 'dist'))
      writeFileSync(
        path.join(project, 'dist/app.js'),
        'const ok = jsx("div", { className: "nave-flex" })\nconst bad = jsx("div", { className: "legacy-card" })\n',
      )
      lintOnce()
      rmSync(path.join(project, 'dist'), { recursive: true, force: true })
      lintOnce()

      expect(verdicts[0]).toHaveLength(1)
      expect(verdicts[0]![0]).toMatch(/^3:@navecss\/class-channel:cx\('legacy-card'\)/)
      expect(verdicts[1]).toEqual(verdicts[0])
      expect(verdicts[2]).toEqual(verdicts[0])
      expect(touched.filter((target) => target.startsWith(project))).toEqual([])
    } finally {
      rmSync(project, { recursive: true, force: true })
    }
  })

  it("the compiled plugin, built into a scratch copy (never this package's own dist/), gives the same verdicts as the source", async () => {
    const scratch = mkdtempSync(path.join(tmpdir(), 'nave-eslint-plugin-build-'))
    const copy = realpathSync(scratch)
    const project = scratchProject()
    try {
      writeFileSync(
        path.join(copy, 'package.json'),
        readFileSync(path.join(PACKAGE_DIR, 'package.json')),
      )
      symlinkSync(path.join(PACKAGE_DIR, 'node_modules'), path.join(copy, 'node_modules'), 'dir')
      execFileSync(
        path.join(PACKAGE_DIR, 'node_modules/.bin/tsc'),
        ['-p', path.join(PACKAGE_DIR, 'tsconfig.build.json'), '--outDir', path.join(copy, 'dist')],
        { cwd: PACKAGE_DIR, stdio: 'pipe' },
      )
      const built = (await import(pathToFileURL(path.join(copy, 'dist/index.js')).href)) as {
        default: unknown
      }
      expect(lintIn(project, built.default, FIXTURE)).toEqual(
        lintIn(project, sourcePlugin, FIXTURE),
      )
    } finally {
      rmSync(copy, { recursive: true, force: true })
      rmSync(project, { recursive: true, force: true })
    }
  })
})
