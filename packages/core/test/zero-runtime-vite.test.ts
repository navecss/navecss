/**
 * AC-directive-core-26: building a real Vite app with
 * `navePlugin()` wired into `css.postcss` (the PostCSS plugin) or into `plugins` (the Vite plugin) adds nothing to
 * the emitted JavaScript — every JS file is byte-identical to the same app built with
 * no adapter at all, once hash-bearing filenames are normalized to a
 * placeholder. And the resolved build leaves no `@nave` for
 * `navecss-core check` to find.
 */
import { mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, statSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { build, createServer } from 'vite'
import { describe, expect, it } from 'vitest'

import { check } from '../src/directive/check.ts'
import { navePlugin } from '../src/postcss.ts'
import { navePlugin as naveVitePlugin } from '../src/vite.ts'

const FIXTURE_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  'fixtures/zero-runtime-vite',
)

/**
 * Every file path under `dir`, recursively, relative to `dir`, with `/`-separated segments regardless of platform.
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
 * Replaces a Rollup/Vite content hash (`-DgELXKtN` immediately before the extension) with a fixed placeholder, so two builds whose hashes differ only because unrelated bytes changed elsewhere are still comparable.
 */
function normalizeHashes(text: string): string {
  return text.replaceAll(/-[\w-]{8,}(?=\.\w+(?:[?#]|$))/g, '-HASH')
}

type Adapter = 'none' | 'postcss' | 'vite'

/**
 * Runs a production build of the fixture into `outDir`. `adapter` selects whether `navePlugin()` is wired into `css.postcss`, into Vite's `plugins` or not at all; the rest of the config is identical between the calls, which is the whole point of the comparison.
 */
async function buildFixture(outDir: string, adapter: Adapter): Promise<void> {
  await build({
    build: { emptyOutDir: true, outDir, write: true },
    configFile: false,
    css: adapter === 'postcss' ? { postcss: { plugins: [navePlugin()] } } : {},
    logLevel: 'silent',
    plugins: adapter === 'vite' ? [naveVitePlugin()] : [],
    root: FIXTURE_ROOT,
  })
}

const byLocaleOrder = (a: string, b: string): number => a.localeCompare(b)

describe.each(['postcss', 'vite'] as const)(
  'AC-directive-core-26 — a real Vite build adds nothing to emitted JS (the %s adapter)',
  (adapter) => {
    it('builds byte-identical JS with and without navePlugin(), and leaves no @nave behind', async () => {
      const tmp = realpathSync(os.tmpdir())
      const outWith = mkdtempSync(path.join(tmp, 'nave-zero-runtime-with-'))
      const outWithout = mkdtempSync(path.join(tmp, 'nave-zero-runtime-without-'))

      try {
        await buildFixture(outWith, adapter)
        await buildFixture(outWithout, 'none')

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
  },
)

/**
 * Every URL the dev server is asked for on a page load of the fixture: the entry, then each module
 * a transformed module imports, which is the set a browser requests.
 */
async function requestedUrls(adapter: Adapter, cacheDir: string): Promise<string[]> {
  const server = await createServer({
    appType: 'custom',
    cacheDir,
    configFile: false,
    css: adapter === 'postcss' ? { postcss: { plugins: [navePlugin()] } } : {},
    logLevel: 'silent',
    plugins: adapter === 'vite' ? [naveVitePlugin()] : [],
    root: FIXTURE_ROOT,
    server: { middlewareMode: true },
  })
  try {
    const seen = new Set<string>()
    const queue = ['/main.js']
    while (queue.length > 0) {
      const url = queue.pop()!
      if (seen.has(url)) continue
      seen.add(url)
      const result = await server.transformRequest(url)
      const matches = result?.code.matchAll(/(?:import|from)\s*["'](\/[^"']+)["']/g) ?? []
      for (const match of matches) queue.push(match[1]!)
    }
    return [...seen].toSorted(byLocaleOrder)
  } finally {
    await server.close()
  }
}

describe('AC-directive-core-26 — the dev server requests the same URLs with the Vite plugin', () => {
  it('on page load, the set of URLs is identical with and without navePlugin()', async () => {
    const before = readdirSync(FIXTURE_ROOT).toSorted(byLocaleOrder)
    const cacheDir = mkdtempSync(path.join(os.tmpdir(), 'nave-zero-runtime-vite-cache-'))
    try {
      const without = await requestedUrls('none', cacheDir)
      const withPlugin = await requestedUrls('vite', cacheDir)

      expect(without.length).toBeGreaterThan(1)
      expect(withPlugin).toEqual(without)
    } finally {
      rmSync(cacheDir, { force: true, recursive: true })
    }
    // the dev server writes nothing into the fixture it serves
    expect(readdirSync(FIXTURE_ROOT).toSorted(byLocaleOrder)).toEqual(before)
  }, 20_000)
})
