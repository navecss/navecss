/**
 * Companion guard to `packages/core/test/no-inlined-dependency.test.ts`, required by
 * `scripts/check-bundling-guard-coverage.mjs`: this package has a non-workspace runtime
 * dependency (`stylelint-declaration-strict-value`), which qualifies it as "capable of
 * bundling" under that tripwire's criterion, even though it has no build step and no bundler at
 * all (R16: "plain ESM with no build step"). That makes this guard trivially, permanently
 * green by construction rather than latent: there is no `dist/` for a dependency to be
 * inlined INTO, so `index.js`'s own static `import` is the only place the dependency could
 * ever appear, and it is checked directly instead of against a build artifact.
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const INDEX_PATH = path.resolve(HERE, '../index.js')

describe('no build inlines a third-party dependency (no build step exists to inline one)', () => {
  it('package.json has no build script', () => {
    const manifest = JSON.parse(readFileSync(path.resolve(HERE, '../package.json'), 'utf8')) as {
      scripts?: Record<string, string>
    }
    expect(manifest.scripts?.build).toBeUndefined()
  })

  it('index.js imports stylelint-declaration-strict-value as a live import, never inlined text', () => {
    const source = readFileSync(INDEX_PATH, 'utf8')
    expect(source).toMatch(/from ['"]stylelint-declaration-strict-value['"]/)
    // The plugin's own compiled bytes (minified variable names it uses internally) never
    // appear in our source: proof the dependency is imported, not copied in.
    expect(source).not.toMatch(/AndyOGo|scale-unlimited\/declaration-strict-value['"]\s*,\s*rule:/)
  })
})
