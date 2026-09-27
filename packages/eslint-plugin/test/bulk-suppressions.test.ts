/**
 * AC-eslint-plugin-17 covers: R9 (its `--cache` and `--concurrency` clause).
 * AC-eslint-plugin-18 covers: R9, R10.
 *
 * End to end against the real ESLint CLI, not `Linter.verify`: ESLint's bulk-suppressions
 * feature (`--suppress-rule`, `--prune-suppressions`) is CLI-level state (`eslint-suppressions.json`
 * on disk), so this is the one behaviour in this package that a programmatic `Linter` call
 * cannot exercise at all.
 */
import { execFileSync } from 'node:child_process'
import {
  appendFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const PACKAGE_DIR = path.resolve(HERE, '..')
const WORKSPACE_ROOT = path.resolve(PACKAGE_DIR, '../..')
const ESLINT_BIN = path.join(WORKSPACE_ROOT, 'node_modules/.bin/eslint')

interface RunResult {
  status: number
  stderr: string
  stdout: string
}

function runEslint(cwd: string, args: string[]): RunResult {
  try {
    const stdout = execFileSync(ESLINT_BIN, args, { cwd, encoding: 'utf8', stdio: 'pipe' })
    return { status: 0, stdout, stderr: '' }
  } catch (error) {
    const execError = error as { status?: number; stderr?: string; stdout?: string }
    return {
      status: execError.status ?? 1,
      stdout: execError.stdout ?? '',
      stderr: execError.stderr ?? '',
    }
  }
}

/**
Two counted `cx.raw()` calls (undeclared, no reason) in one file, plus one declared, passing call.
 */
const FIXTURE_SOURCE = [
  "import { cx } from '@navecss/core/cx'",
  "const a = <div className={cx.raw('legacy-card')} />",
  "const b = <div className={cx.raw('another-legacy')} />",
  "const c = <div className={cx.raw('app-shell')} />",
].join('\n')

function scratchProject(
  ruleSeverity: 'error' | 'warn',
  otherRules: Record<string, string> = {},
): string {
  const dir = mkdtempSync(path.join(tmpdir(), 'nave-bulk-suppressions-'))
  mkdirSync(path.join(dir, 'src'))
  writeFileSync(path.join(dir, 'src/a.jsx'), FIXTURE_SOURCE)
  const distIndex = pathToImportSpecifier(path.join(PACKAGE_DIR, 'dist/index.js'))
  writeFileSync(
    path.join(dir, 'eslint.config.js'),
    [
      `import nave from ${JSON.stringify(distIndex)}`,
      'export default [',
      '  { files: ["**/*.jsx"], languageOptions: { parserOptions: { ecmaFeatures: { jsx: true } } },',
      `    plugins: { '@navecss': nave },`,
      `    settings: { '@navecss': { allow: ['app-'] } },`,
      `    rules: ${JSON.stringify({ ...otherRules, '@navecss/count-escapes': ruleSeverity })} },`,
      ']',
    ].join('\n'),
  )
  writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: 'fixture', type: 'module' }))
  return dir
}

function pathToImportSpecifier(absolutePath: string): string {
  return absolutePath.replaceAll('\\', '/')
}

function suppressionsFile(dir: string): Record<string, Record<string, { count: number }>> {
  return JSON.parse(readFileSync(path.join(dir, 'eslint-suppressions.json'), 'utf8')) as Record<
    string,
    Record<string, { count: number }>
  >
}

describe('AC-18: ESLint bulk suppressions hold the escape count', () => {
  it('at error: --suppress-rule writes the real count, and a plain run then exits 0', () => {
    const dir = scratchProject('error')
    try {
      const suppress = runEslint(dir, ['--suppress-rule', '@navecss/count-escapes'])
      expect(suppress.status).toBe(0)
      const suppressions = suppressionsFile(dir)
      expect(suppressions['src/a.jsx']!['@navecss/count-escapes']!.count).toBe(2)

      const plain = runEslint(dir, [])
      expect(plain.status).toBe(0)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('adding one counted cx.raw() makes the run exit 1', () => {
    const dir = scratchProject('error')
    try {
      runEslint(dir, ['--suppress-rule', '@navecss/count-escapes'])
      writeFileSync(
        path.join(dir, 'src/a.jsx'),
        `${FIXTURE_SOURCE}\nconst d = <div className={cx.raw('yet-another')} />`,
      )
      const result = runEslint(dir, [])
      expect(result.status).toBe(1)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('removing one counted call exits 2, naming --prune-suppressions; pruning restores exit 0 with the count one lower', () => {
    const dir = scratchProject('error')
    try {
      runEslint(dir, ['--suppress-rule', '@navecss/count-escapes'])
      writeFileSync(
        path.join(dir, 'src/a.jsx'),
        FIXTURE_SOURCE.split('\n')
          .filter((line) => !line.includes('another-legacy'))
          .join('\n'),
      )
      const result = runEslint(dir, [])
      expect(result.status).toBe(2)
      expect(result.stderr).toContain('--prune-suppressions')

      const pruned = runEslint(dir, ['--prune-suppressions'])
      expect(pruned.status).toBe(0)
      const suppressions = suppressionsFile(dir)
      expect(suppressions['src/a.jsx']!['@navecss/count-escapes']!.count).toBe(1)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('adding a nave-escape reason to a counted call leaves the run at exit 0 with the count unchanged', () => {
    const dir = scratchProject('error')
    try {
      runEslint(dir, ['--suppress-rule', '@navecss/count-escapes'])
      writeFileSync(
        path.join(dir, 'src/a.jsx'),
        FIXTURE_SOURCE.replace(
          "cx.raw('legacy-card')",
          "cx.raw(/* nave-escape: vendor widget */ 'legacy-card')",
        ),
      )
      const result = runEslint(dir, [])
      expect(result.status).toBe(0)
      const suppressions = suppressionsFile(dir)
      expect(suppressions['src/a.jsx']!['@navecss/count-escapes']!.count).toBe(2)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('at warn: --suppress-rule records no entry for the rule', () => {
    const dir = scratchProject('warn')
    try {
      const suppress = runEslint(dir, ['--suppress-rule', '@navecss/count-escapes'])
      expect(suppress.status).toBe(0)
      const suppressions = suppressionsFile(dir)
      expect(suppressions['src/a.jsx']?.['@navecss/count-escapes']).toBeUndefined()
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})

/**
 * Six files, each holding one counted `cx.raw()` call with a reason, so every file carries a
 * report and a run that reads one file's result through another's state would show it.
 */
function sixFileProject(): string {
  const dir = scratchProject('error')
  rmSync(path.join(dir, 'src/a.jsx'))
  for (const index of [1, 2, 3, 4, 5, 6]) {
    writeFileSync(
      path.join(dir, `src/f${index}.jsx`),
      "import { cx } from '@navecss/core/cx'\nexport const A = () => <div className={cx.raw(/* nave-escape: vendor widget */ 'legacy-card')} />\n",
    )
  }
  return dir
}

const EDIT = "export const B = () => <div className={cx.raw('other-legacy')} />\n"

/**
Each file's reports from a `-f json` run, as `[file, ['rule@line', ...]]` in file order.
 */
function reportsByFile(run: RunResult): [string, string[]][] {
  const results = JSON.parse(run.stdout) as {
    filePath: string
    messages: { line: number; ruleId: string }[]
  }[]
  return results
    .map((result): [string, string[]] => [
      path.basename(result.filePath),
      result.messages.map((message) => `${message.ruleId}@${message.line}`),
    ])
    .toSorted(([a], [b]) => a.localeCompare(b))
}

function readSuppressions(dir: string): string {
  return readFileSync(path.join(dir, 'eslint-suppressions.json'), 'utf8')
}

describe('AC-17: the count keeps no state across files, under --cache and --concurrency', () => {
  it('a warm --cache run after one file changed gives the same reports as a cold run', () => {
    const cold = sixFileProject()
    const warm = sixFileProject()
    try {
      appendFileSync(path.join(cold, 'src/f2.jsx'), EDIT)
      const reference = runEslint(cold, ['-f', 'json', 'src'])

      expect(runEslint(warm, ['--cache', 'src']).status).toBe(1)
      appendFileSync(path.join(warm, 'src/f2.jsx'), EDIT)
      const cached = runEslint(warm, ['--cache', '-f', 'json', 'src'])

      expect(reportsByFile(reference)).toHaveLength(6)
      expect(reportsByFile(cached)).toEqual(reportsByFile(reference))
      expect(cached.status).toBe(reference.status)
    } finally {
      rmSync(cold, { recursive: true, force: true })
      rmSync(warm, { recursive: true, force: true })
    }
  })

  it('--suppress-rule writes the same suppressions file with and without --cache', () => {
    const plain = sixFileProject()
    const cached = sixFileProject()
    try {
      runEslint(plain, ['--suppress-rule', '@navecss/count-escapes', 'src'])
      runEslint(cached, ['--cache', 'src'])
      runEslint(cached, ['--cache', '--suppress-rule', '@navecss/count-escapes', 'src'])
      expect(readSuppressions(cached)).toBe(readSuppressions(plain))
    } finally {
      rmSync(plain, { recursive: true, force: true })
      rmSync(cached, { recursive: true, force: true })
    }
  })

  it('a warm cache holds no count: with the suppressions file deleted, the next cached run fails', () => {
    const dir = sixFileProject()
    try {
      runEslint(dir, ['--suppress-rule', '@navecss/count-escapes', 'src'])
      expect(runEslint(dir, ['--cache', 'src']).status).toBe(0)
      rmSync(path.join(dir, 'eslint-suppressions.json'))
      expect(runEslint(dir, ['--cache', 'src']).status).toBe(1)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('--concurrency 2 gives the same reports and the same suppressions file as a single thread', () => {
    const single = sixFileProject()
    const parallel = sixFileProject()
    try {
      const singleRun = runEslint(single, ['-f', 'json', 'src'])
      const parallelRun = runEslint(parallel, ['--concurrency', '2', '-f', 'json', 'src'])
      expect(reportsByFile(singleRun)).toHaveLength(6)
      expect(reportsByFile(parallelRun)).toEqual(reportsByFile(singleRun))

      runEslint(single, ['--suppress-rule', '@navecss/count-escapes', 'src'])
      runEslint(parallel, [
        '--concurrency',
        '2',
        '--suppress-rule',
        '@navecss/count-escapes',
        'src',
      ])
      expect(readSuppressions(parallel)).toBe(readSuppressions(single))
    } finally {
      rmSync(single, { recursive: true, force: true })
      rmSync(parallel, { recursive: true, force: true })
    }
  })
})

describe('AC-19: the count limits the README states hold under the real CLI', () => {
  it('swapping a counted escape for a counted disable comment in the same file nets zero', () => {
    const dir = scratchProject('error', { '@navecss/class-channel': 'error' })
    try {
      writeFileSync(
        path.join(dir, 'src/a.jsx'),
        "import { cx } from '@navecss/core/cx'\nconst a = <div className={cx.raw('legacy-card')} />\n",
      )
      runEslint(dir, ['--suppress-rule', '@navecss/count-escapes'])
      const before = readFileSync(path.join(dir, 'eslint-suppressions.json'), 'utf8')
      writeFileSync(
        path.join(dir, 'src/a.jsx'),
        'import { cx } from \'@navecss/core/cx\'\n// eslint-disable-next-line @navecss/class-channel\nconst a = <div className="legacy-card other-legacy" />\n',
      )
      expect(runEslint(dir, []).status).toBe(0)
      expect(readFileSync(path.join(dir, 'eslint-suppressions.json'), 'utf8')).toBe(before)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('an inline comment turning the counting rule off fails a baselined file on unused suppressions, and shows nothing in a file with no entry', () => {
    const dir = scratchProject('error')
    try {
      runEslint(dir, ['--suppress-rule', '@navecss/count-escapes'])
      const off = '/* eslint @navecss/count-escapes: "off" */\n'
      writeFileSync(path.join(dir, 'src/b.jsx'), `${off}${FIXTURE_SOURCE}`)
      expect(runEslint(dir, []).status).toBe(0)

      writeFileSync(path.join(dir, 'src/a.jsx'), `${off}${FIXTURE_SOURCE}`)
      const result = runEslint(dir, [])
      expect(result.status).toBe(2)
      expect(result.stderr).toContain('--prune-suppressions')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
