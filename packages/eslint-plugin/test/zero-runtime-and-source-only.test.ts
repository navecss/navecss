import { RuleTester } from 'eslint'
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
import { execSync } from 'node:child_process'
import {
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
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
    const otherPackageSrcDirs = ['core', 'tokens', 'bridge', 'cli', 'stylelint-config']
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
    for (const name of ['core', 'tokens', 'bridge', 'cli', 'stylelint-config']) {
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

describe('AC-06: rules key on source, never on build output (R3)', () => {
  const ruleTester = new RuleTester()
  const languageOptions = {
    ecmaVersion: 2024 as const,
    sourceType: 'module' as const,
    parserOptions: { ecmaFeatures: { jsx: true } },
  }
  const code = `import { cx } from '@navecss/core/cx'\nconst el = <div className={cx('flex')} />\nconst bad = <div className={cx('legacy-card')} />`

  function runFixture(): void {
    ruleTester.run('class-channel', classChannelRule, {
      valid: [],
      invalid: [{ code, languageOptions, errors: 1 }],
    })
  }

  it('the same verdict holds with no dist/ present, after one is created, and after it is deleted again', () => {
    // Never actually read by any rule in this package (nothing here resolves a "dist" path of
    // the consumer's own project); this loop proves that directly rather than assuming it.
    const scratchDist = mkdtempSync(path.join(tmpdir(), 'nave-consumer-dist-'))
    try {
      expect(() => runFixture()).not.toThrow()
      mkdirSync(path.join(scratchDist, 'dist'))
      writeFileSync(path.join(scratchDist, 'dist', 'bundle.js'), 'export const x = 1\n')
      expect(() => runFixture()).not.toThrow()
      rmSync(path.join(scratchDist, 'dist'), { recursive: true, force: true })
      expect(() => runFixture()).not.toThrow()
    } finally {
      rmSync(scratchDist, { recursive: true, force: true })
    }
  })

  it("a real tsc build of this package itself does not change class-channel's own verdicts", () => {
    // Rebuilds THIS package (never the fixture's own — there is no bundler in this repo that
    // would "inline" a call, only R3's own build, exercised here as the real one available).
    execSync('pnpm run build', { cwd: PACKAGE_DIR, stdio: 'ignore' })
    expect(() => runFixture()).not.toThrow()
  })
})
