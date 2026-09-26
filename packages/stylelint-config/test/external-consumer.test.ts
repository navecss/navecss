/**
 * AC-consumer-constraints-26 covers: R16.
 *
 * A consumer project OUTSIDE the workspace, with pnpm's isolated `node_modules` (never
 * `node-linker=hoisted`, which would mask a resolution bug this test exists to catch),
 * depending on `stylelint` and on the real tarball this package's own `pnpm pack` produces,
 * and explicitly NOT depending on `stylelint-declaration-strict-value` itself (so a pass here
 * proves the plugin resolves from `@navecss/stylelint-config`'s own dependency, not from
 * anything the consumer happens to hoist).
 */
import { execFileSync, spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const PACKAGE_DIR = path.resolve(HERE, '..')

const dir: { consumer?: string } = {}

beforeAll(() => {
  const consumerTmp = mkdtempSync(path.join(tmpdir(), 'nave-stylelint-config-consumer-'))
  dir.consumer = realpathSync(consumerTmp)
  const consumerDir = dir.consumer

  const packDestination = mkdtempSync(path.join(tmpdir(), 'nave-stylelint-config-consumer-pack-'))
  const raw = execFileSync('npm', ['pack', '--json', '--pack-destination', packDestination], {
    cwd: PACKAGE_DIR,
    encoding: 'utf8',
  })
  const [entry] = JSON.parse(raw) as { filename: string }[]
  const tarballPath = path.join(packDestination, entry!.filename)

  writeFileSync(
    path.join(consumerDir, 'package.json'),
    JSON.stringify(
      {
        name: 'nave-stylelint-config-consumer',
        version: '1.0.0',
        private: true,
        dependencies: {
          stylelint: '^17.0.0',
          '@navecss/stylelint-config': `file:${tarballPath}`,
        },
      },
      undefined,
      2,
    ),
  )
  writeFileSync(path.join(consumerDir, '.npmrc'), 'node-linker=isolated\n')
  writeFileSync(
    path.join(consumerDir, '.stylelintrc.json'),
    JSON.stringify({ extends: ['@navecss/stylelint-config'] }, undefined, 2),
  )
  execFileSync('pnpm', ['install', '--no-lockfile'], { cwd: consumerDir, encoding: 'utf8' })
  rmSync(packDestination, { recursive: true, force: true })
}, 120_000)

afterAll(() => {
  if (dir.consumer) rmSync(dir.consumer, { recursive: true, force: true })
})

interface StylelintJsonResult {
  warnings: { line: number; rule: string }[]
}

/**
 * stylelint's CLI exits non-zero when it finds a warning, so `spawnSync` (never
 * `execFileSync`, which throws and discards captured output on a non-zero exit) is used to
 * read the JSON report regardless of the exit code.
 */
function runStylelintJson(): StylelintJsonResult[] {
  const consumerDir = dir.consumer!
  const result = spawnSync(
    path.join(consumerDir, 'node_modules/.bin/stylelint'),
    ['test.css', '--formatter', 'json'],
    { cwd: consumerDir, encoding: 'utf8' },
  )
  // stylelint's CLI writes the JSON report to stdout when clean, but to STDERR when it finds
  // any warning (its exit code is then non-zero too) — read whichever stream is non-empty.
  const raw = result.stdout || result.stderr
  return JSON.parse(raw) as StylelintJsonResult[]
}

describe('AC-consumer-constraints-26 covers: R16', () => {
  it('does not itself depend on stylelint-declaration-strict-value (the isolation this test relies on)', () => {
    const manifestPath = path.join(dir.consumer!, 'package.json')
    const consumerManifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as {
      dependencies: Record<string, string>
    }
    expect(consumerManifest.dependencies).not.toHaveProperty('stylelint-declaration-strict-value')
  })

  it('.a { padding: 13px; } is reported (the plugin resolves from the package, not the consumer)', () => {
    writeFileSync(
      path.join(dir.consumer!, 'test.css'),
      '.a { padding: 13px; }\n.b { @nave interactive; }',
    )
    const [result] = runStylelintJson()
    const byLine = new Map<number, string[]>()
    for (const w of result!.warnings) byLine.set(w.line, [...(byLine.get(w.line) ?? []), w.rule])

    expect(byLine.get(1)).toContain('scale-unlimited/declaration-strict-value')
  })

  it('.b { @nave interactive; } produces no report from any rule the package ships', () => {
    const [result] = runStylelintJson()
    const line2Rules = result!.warnings.filter((w) => w.line === 2).map((w) => w.rule)
    expect(line2Rules).toEqual([])
  })
})
