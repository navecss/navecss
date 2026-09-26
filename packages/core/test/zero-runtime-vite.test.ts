/**
 * AC-directive-core-26 (slice 1 rows only): building a real Vite app with
 * `navePlugin()` wired into `css.postcss` adds nothing to the emitted
 * JavaScript — every JS file is byte-identical to the same app built with
 * no adapter at all, once hash-bearing filenames are normalized to a
 * placeholder. And the resolved build leaves no `@nave` for
 * `navecss-core check` to find.
 */
import { mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, statSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from 'vite'
import { describe, expect, it } from 'vitest'

import { check } from '../src/directive/check.ts'
import { navePlugin } from '../src/postcss.ts'

const FIXTURE_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  'fixtures/zero-runtime-vite',
)

/**
Every file path under `dir`, recursively, relative to `dir`, with `/`-separated segments regardless of platform.
 */
function listFilesRecursively(dir: string): string[] {
  const entries: string[] = []
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name)
    if (statSync(full).isDirectory()) {
      entries.push(...listFilesRecursively(full).map((rel) => `${name}/${rel}`))
    } else {
      entries.push(name)
    }
  }
  return entries
}

/**
Replaces a Rollup/Vite content hash (`-DgELXKtN` immediately before the extension) with a fixed placeholder, so two builds whose hashes differ only because unrelated bytes changed elsewhere are still comparable.
 */
function normalizeHashes(text: string): string {
  return text.replaceAll(/-[\w-]{8,}(?=\.\w+(?:[?#]|$))/g, '-HASH')
}

/**
Runs a production build of the fixture into `outDir`. `hasAdapter` selects whether `navePlugin()` is wired into `css.postcss`; the rest of the config is identical between the two calls, which is the whole point of the comparison.
 */
async function buildFixture(outDir: string, hasAdapter: boolean): Promise<void> {
  await build({
    build: { emptyOutDir: true, outDir, write: true },
    configFile: false,
    css: hasAdapter ? { postcss: { plugins: [navePlugin()] } } : {},
    logLevel: 'silent',
    root: FIXTURE_ROOT,
  })
}

const byLocaleOrder = (a: string, b: string): number => a.localeCompare(b)

describe('AC-directive-core-26 — a real Vite build adds nothing to emitted JS', () => {
  it('builds byte-identical JS with and without navePlugin() wired into css.postcss, and leaves no @nave behind', async () => {
    const tmp = realpathSync(os.tmpdir())
    const outWith = mkdtempSync(path.join(tmp, 'nave-zero-runtime-with-'))
    const outWithout = mkdtempSync(path.join(tmp, 'nave-zero-runtime-without-'))

    try {
      await buildFixture(outWith, true)
      await buildFixture(outWithout, false)

      const jsFilesWith = listFilesRecursively(outWith)
        .filter((f) => f.endsWith('.js'))
        .map((f) => normalizeHashes(f))
        .toSorted(byLocaleOrder)
      const jsFilesWithout = listFilesRecursively(outWithout)
        .filter((f) => f.endsWith('.js'))
        .map((f) => normalizeHashes(f))
        .toSorted(byLocaleOrder)

      expect(jsFilesWith.length).toBeGreaterThan(0)
      expect(jsFilesWith).toEqual(jsFilesWithout)

      const rawWith = listFilesRecursively(outWith).filter((f) => f.endsWith('.js'))
      const rawWithout = listFilesRecursively(outWithout).filter((f) => f.endsWith('.js'))
      const byNormalizedName = new Map(rawWithout.map((f) => [normalizeHashes(f), f]))

      for (const fileWith of rawWith) {
        const fileWithout = byNormalizedName.get(normalizeHashes(fileWith))
        expect(
          fileWithout,
          `no matching file for ${fileWith} in the without-adapter build`,
        ).toBeDefined()

        const contentWith = normalizeHashes(readFileSync(path.join(outWith, fileWith), 'utf8'))
        const contentWithout = normalizeHashes(
          readFileSync(path.join(outWithout, fileWithout!), 'utf8'),
        )
        expect(contentWith).toBe(contentWithout)
        expect(contentWith).not.toContain('postcss-nave')
        expect(contentWith).not.toContain('unknown atom')
      }

      const result = await check({ source: [outWith] })
      expect(result.findings).toEqual([])
      expect(result.status).toBe(0)
    } finally {
      rmSync(outWith, { force: true, recursive: true })
      rmSync(outWithout, { force: true, recursive: true })
    }
  }, 20_000)
})
