/**
 * AC-consumer-constraints-26 covers: R16.
 *
 * A consumer project OUTSIDE the workspace, with pnpm's isolated `node_modules` (never
 * `node-linker=hoisted`, which would mask a resolution bug this test exists to catch),
 * depending on `stylelint` and on the real tarballs this package's and `@navecss/tokens`' own
 * `pnpm pack` produce, and explicitly NOT depending on `stylelint-declaration-strict-value`
 * itself (so a pass here proves the plugin resolves from `@navecss/stylelint-config`'s own
 * dependency, not from anything the consumer happens to hoist).
 *
 * `@navecss/tokens` is a required peer (R16) but is packed and installed here as a `file:`
 * tarball, the same as this package itself, rather than left for pnpm to satisfy from the
 * registry: pnpm auto-installs a missing peer from the registry by default, and a registry with
 * a minimum release age configured can refuse every matching version of a package this young,
 * which would test pnpm's own resolution rather than this package's rule against real,
 * workspace-built tokens.
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
const TOKENS_PACKAGE_DIR = path.resolve(PACKAGE_DIR, '../tokens')

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
 * Packs `packageDir` with `npm pack --json` into `packDestination` and returns the tarball's
 * absolute path. Used for both this package and `@navecss/tokens`, so the consumer installs the
 * workspace's own build of each, never a registry copy.
 */
function packWorkspacePackage(packageDir: string, packDestination: string): string {
  const raw = execFileSync('npm', ['pack', '--json', '--pack-destination', packDestination], {
    cwd: packageDir,
    encoding: 'utf8',
  })
  return path.join(packDestination, tarballFilename(raw))
}

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
  const tarballPath = packWorkspacePackage(PACKAGE_DIR, packDestination)
  const tokensTarballPath = packWorkspacePackage(TOKENS_PACKAGE_DIR, packDestination)

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
          // Satisfies the package's required `@navecss/tokens` peer with the workspace's own
          // tarball, so pnpm never reaches for the registry to resolve it (see the file
          // docblock for why that matters).
          '@navecss/tokens': `file:${tokensTarballPath}`,
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

describe('the required @navecss/tokens peer, installed as a workspace tarball rather than left to the registry', () => {
  it("the consumer's installed @navecss/tokens is the workspace's own build, byte for byte", () => {
    const installedTokensCss = readFileSync(
      path.join(dir.consumer!, 'node_modules/@navecss/tokens/dist/tokens.css'),
      'utf8',
    )
    const installedManifest = JSON.parse(
      readFileSync(path.join(dir.consumer!, 'node_modules/@navecss/tokens/package.json'), 'utf8'),
    ) as { version: string }
    const workspaceManifest = JSON.parse(
      readFileSync(path.join(TOKENS_PACKAGE_DIR, 'package.json'), 'utf8'),
    ) as { version: string }
    const workspaceTokensCss = readFileSync(
      path.join(TOKENS_PACKAGE_DIR, 'dist/tokens.css'),
      'utf8',
    )

    expect(installedManifest.version).toBe(workspaceManifest.version)
    expect(installedTokensCss).toBe(workspaceTokensCss)
  })
})

describe("rule 3 (declared-custom-properties) busts stylelint's own --cache through its default digest", () => {
  it('a name that passes cold and under a warm --cache is reported once removed from the installed tokens, with no cache clear', () => {
    const consumerDir = dir.consumer!
    const tokensCssPath = path.join(consumerDir, 'node_modules/@navecss/tokens/dist/tokens.css')
    const originalTokensCss = readFileSync(tokensCssPath, 'utf8')
    const match = /^\s*(--nave-[a-z0-9-]+):[^;]*;\s*$/m.exec(originalTokensCss)
    if (!match) throw new Error('the installed tokens.css declares no --nave- custom property')
    const [declarationLine, name] = [match[0], match[1]!]

    const cachePath = path.join(consumerDir, '.cache-test.stylelintcache')
    const cssPath = path.join(consumerDir, 'cache-test.css')
    rmSync(cachePath, { force: true })
    writeFileSync(cssPath, `.a { color: var(${name}); }\n`)

    const runCli = (): { status: number | null; stderr: string; stdout: string } =>
      spawnSync(
        path.join(consumerDir, 'node_modules/.bin/stylelint'),
        ['cache-test.css', '--cache', '--cache-location', cachePath],
        { cwd: consumerDir, encoding: 'utf8' },
      )

    try {
      const cold = runCli()
      if (cold.status !== 0) throw new Error(`stylelint failed: ${cold.stderr}`)

      // The installed tokens.css changes; the config the consumer's stylelintrc resolves does
      // not (it names no path into the workspace, nothing in the consumer's own text changed),
      // so only the default stylesheet's digest, baked into that config by this rule, can make
      // stylelint's cache see a different config and re-check this file.
      writeFileSync(tokensCssPath, originalTokensCss.replace(declarationLine, ''))

      const warm = runCli()
      expect(warm.status).not.toBe(0)
      expect(warm.stdout + warm.stderr).toContain(name)
    } finally {
      writeFileSync(tokensCssPath, originalTokensCss)
      rmSync(cachePath, { force: true })
      rmSync(cssPath, { force: true })
    }
  })
})
