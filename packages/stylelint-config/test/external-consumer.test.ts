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
import { existsSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { tarballFilename } from './helpers/pack.ts'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const PACKAGE_DIR = path.resolve(HERE, '..')
const ROOT = path.resolve(PACKAGE_DIR, '../..')

const dir: { consumer?: string } = {}

beforeAll(() => {
  const consumerTmp = mkdtempSync(path.join(tmpdir(), 'nave-stylelint-config-consumer-'))
  dir.consumer = realpathSync(consumerTmp)
  const consumerDir = dir.consumer

  const packDestination = mkdtempSync(path.join(tmpdir(), 'nave-stylelint-config-consumer-pack-'))
  try {
    installConsumer(consumerDir, packDestination)
  } finally {
    rmSync(packDestination, { recursive: true, force: true })
  }
}, 120_000)

/**
 * The exact stylelint version this workspace resolves, read from the installed package, so the
 * consumer installs the stylelint the rest of this suite ran against rather than whatever the
 * registry's newest `^17` is on the day.
 */
function workspaceStylelintVersion(): string {
  const fromPackage = createRequire(path.join(PACKAGE_DIR, 'package.json'))
  let candidate = path.dirname(fromPackage.resolve('stylelint'))
  while (
    path.basename(candidate) !== 'stylelint' ||
    !existsSync(path.join(candidate, 'package.json'))
  ) {
    const parent = path.dirname(candidate)
    if (parent === candidate) throw new Error('no installed stylelint package.json found')
    candidate = parent
  }
  const manifestPath = path.join(candidate, 'package.json')
  return (JSON.parse(readFileSync(manifestPath, 'utf8')) as { version: string }).version
}

function installConsumer(consumerDir: string, packDestination: string): void {
  const raw = execFileSync('npm', ['pack', '--json', '--pack-destination', packDestination], {
    cwd: PACKAGE_DIR,
    encoding: 'utf8',
  })
  const tarballPath = path.join(packDestination, tarballFilename(raw))

  // Pinned to this repo's own `packageManager`, not a hardcoded literal: without a pin,
  // corepack can't tell which pnpm the consumer wants and falls back to auto-detecting and
  // fetching an unrelated version, which a network-restricted CI runner has been measured to
  // fail. Pinning to the version corepack has already activated for the workspace install in
  // the same job lets it resolve here with no further download.
  const { packageManager } = JSON.parse(readFileSync(path.join(ROOT, 'package.json'), 'utf8')) as {
    packageManager: string
  }

  writeFileSync(
    path.join(consumerDir, 'package.json'),
    JSON.stringify(
      {
        name: 'nave-stylelint-config-consumer',
        version: '1.0.0',
        private: true,
        packageManager,
        dependencies: {
          stylelint: workspaceStylelintVersion(),
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
}

afterAll(() => {
  if (dir.consumer) rmSync(dir.consumer, { recursive: true, force: true })
})

interface StylelintJsonResult {
  warnings: { line: number; rule: string }[]
}

/**
 * Lints `code` as the consumer's own `test.css` with the consumer's installed stylelint CLI, and
 * parses the JSON report it writes to `--output-file`, and nothing else: the CLI prints that
 * report to stdout on a clean run and to stderr once it finds a problem, so reading whichever
 * stream is non-empty would parse any other text a failing run printed. A run that wrote no
 * parseable report throws with its exit status and stderr. `spawnSync`, not `execFileSync`,
 * because the CLI exits non-zero whenever it reports anything.
 */
function lintInConsumer(code: string): StylelintJsonResult {
  const consumerDir = dir.consumer!
  writeFileSync(path.join(consumerDir, 'test.css'), code)
  const reportPath = path.join(consumerDir, 'stylelint-report.json')
  rmSync(reportPath, { force: true })
  const result = spawnSync(
    path.join(consumerDir, 'node_modules/.bin/stylelint'),
    ['test.css', '--formatter', 'json', '--output-file', reportPath],
    { cwd: consumerDir, encoding: 'utf8' },
  )
  let report: StylelintJsonResult[]
  try {
    report = JSON.parse(readFileSync(reportPath, 'utf8')) as StylelintJsonResult[]
  } catch {
    throw new Error(
      `stylelint wrote no JSON report (status ${String(result.status)}): ${result.stderr}`,
    )
  }
  expect(report).toHaveLength(1)
  return report[0]!
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
    const result = lintInConsumer('.a { padding: 13px; }')
    expect(result.warnings.map((w) => w.rule)).toContain('scale-unlimited/declaration-strict-value')
  })

  it('.b { @nave interactive; } produces no report from any rule the package ships', () => {
    const result = lintInConsumer('.b { @nave interactive; }')
    expect(result.warnings).toEqual([])
  })
})
