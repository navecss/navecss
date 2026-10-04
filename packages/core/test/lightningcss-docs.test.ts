/**
 * What the slice that adds the Lightning CSS adapter, `navecss-core expand` and the self-contained
 * stylesheet has to say, and what it must stop saying: AC-directive-core-46 (the surfaces it adds),
 * and the README sentences AC-40, -42, -43, -44 and -45 each name. The fences that carry a claim a
 * run can check are run by `scripts/generate-no-bundler-fixture.ts` and the browser test over it.
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

import { extractFences } from './doc-fences.ts'

const CORE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const REPO_ROOT = path.resolve(CORE_ROOT, '../..')

const rootReadme = readFileSync(path.join(REPO_ROOT, 'README.md'), 'utf8')
const coreReadme = readFileSync(path.join(CORE_ROOT, 'README.md'), 'utf8')
const manifest = JSON.parse(readFileSync(path.join(CORE_ROOT, 'package.json'), 'utf8')) as {
  keywords: string[]
}

/**
 * The text of a `##`/`###` section: from its heading to the next heading of the same or a shallower
 * level.
 */
function section(markdown: string, heading: string): string {
  const level = heading.match(/^#+/)![0].length
  const start = markdown.indexOf(`\n${heading}\n`)
  expect(start, `no "${heading}" heading`).toBeGreaterThanOrEqual(0)
  const rest = markdown.slice(start + heading.length + 2)
  const next = new RegExp(`\\n#{1,${level}} `).exec(rest)
  return next ? rest.slice(0, next.index) : rest
}

const flat = (text: string): string => text.replaceAll(/\s+/g, ' ')

const STANDALONE_PATH = 'node_modules/@navecss/core/dist/standalone.css'
const STANDALONE_CDN = 'https://cdn.jsdelivr.net/npm/@navecss/core/dist/standalone.css'

describe('AC-directive-core-46 — the root README teaches the no-bundler route', () => {
  const quickStart = rootReadme.slice(
    rootReadme.indexOf('## Quick start'),
    rootReadme.indexOf('## Getting started'),
  )
  const noBundler = flat(section(rootReadme, '### Without a bundler'))

  it('has a no-bundler subsection of the Quick start', () => {
    expect(quickStart).toContain('\n### Without a bundler\n')
  })

  it('its fences link the self-contained stylesheet by path and by CDN URL, before the expanded stylesheet', () => {
    const html = extractFences('README.md', section(rootReadme, '### Without a bundler')).find(
      (fence) => fence.lang === 'html',
    )

    expect(html, 'no html fence').toBeDefined()
    const byPath = html!.body.indexOf(STANDALONE_PATH)
    const byCdn = html!.body.indexOf(STANDALONE_CDN)
    const expanded = html!.body.indexOf('app.css')
    expect(byPath).toBeGreaterThanOrEqual(0)
    expect(byCdn).toBeGreaterThanOrEqual(0)
    expect(expanded).toBeGreaterThan(Math.max(byPath, byCdn))
  })

  it('its fences run navecss-core expand from a package.json script, never as a bare npx line', () => {
    const scripts = extractFences('README.md', section(rootReadme, '### Without a bundler')).find(
      (fence) => fence.lang === 'json',
    )

    expect(scripts?.body).toMatch(
      /"[\w:-]+": "navecss-core expand --source=src\/app\.css --out=app\.css"/,
    )
    expect(rootReadme).not.toContain('npx navecss-core')
  })

  it('says the command does not inline @import, so a bare import is an error that names the stylesheet to link', () => {
    expect(noBundler).toMatch(/does not (?:resolve or )?inline `@import`/)
    expect(noBundler).toMatch(/bare/i)
    expect(noBundler).toContain('@navecss/core/standalone')
  })

  it('states the costs: a second app.css shape, the file copied out of node_modules at deploy', () => {
    expect(noBundler).toMatch(/cop(?:y|ies) the file out of `?node_modules/i)
  })

  it('the "A CSS resolver that reads exports maps" paragraph gives the command’s answer', () => {
    const paragraph = flat(
      /\*\*A CSS resolver that reads `exports` maps\.\*\*[\s\S]*?\n\n/.exec(quickStart)![0],
    )

    expect(paragraph).toContain('navecss-core expand')
    expect(paragraph).toContain('standalone')
  })

  it('names the no-bundler route in the step that resolves @nave, beside Vite and PostCSS', () => {
    expect(flat(quickStart)).toMatch(/`navecss-core expand`/)
  })
})

describe('AC-directive-core-46 — the core README has the Lightning CSS adapter section', () => {
  const lightning = flat(section(coreReadme, '### Lightning CSS adapter setup'))

  it('says it is for a host that runs Lightning CSS directly, and not for Vite (AC-40)', () => {
    expect(lightning).toMatch(/runs Lightning CSS directly/)
    expect(lightning).toMatch(/not (?:the route )?for Vite/i)
  })

  it('states the supported range as 1.22 and later, with 1.20’s nesting reason (AC-40)', () => {
    expect(lightning).toMatch(/1\.22 and later/)
    expect(lightning).toMatch(/1\.20/)
    expect(lightning).toMatch(/nesting/)
    expect(lightning).toMatch(/measured, not declared|documented, not declared/)
  })

  it('states that it imports nothing from Lightning CSS and declares no peer', () => {
    expect(lightning).toMatch(/imports nothing from `?lightningcss`?/)
    expect(lightning).toMatch(/no peer/)
  })

  it('states the cost on the bundleAsync path: no map for Nave’s insertions, line numbers hold', () => {
    expect(lightning).toMatch(/`bundleAsync\(\)`/)
    expect(lightning).toMatch(/source map/)
    expect(lightning).toMatch(/line numbers/)
  })

  it('has a fence for transform() with inputSourceMap, and one for bundleAsync() with the resolver', () => {
    const fences = extractFences(
      'packages/core/README.md',
      section(coreReadme, '### Lightning CSS adapter setup'),
    )
    const bodies = fences.map((fence) => fence.body).join('\n')

    expect(bodies).toContain("from '@navecss/core/lightningcss'")
    expect(bodies).toContain('inputSourceMap')
    expect(bodies).toContain('bundleAsync')
    expect(bodies).toContain('resolver')
  })

  it('the PostCSS trap sentence points a host that runs Lightning CSS directly to it', () => {
    const trap = flat(section(coreReadme, '### PostCSS plugin setup'))

    expect(trap).toContain('(#lightning-css-adapter-setup)')
  })

  it('the Exports table has rows for @navecss/core/lightningcss and @navecss/core/standalone', () => {
    expect(coreReadme).toMatch(/\| `@navecss\/core\/lightningcss`\s+\|/)
    expect(coreReadme).toMatch(/\| `@navecss\/core\/standalone`\s+\|/)
  })

  it('package.json keywords hold lightningcss', () => {
    expect(manifest.keywords).toContain('lightningcss')
  })

  it('keeps ### Where `@nave` is valid byte for byte', () => {
    expect(coreReadme).toContain('\n### Where `@nave` is valid\n')
  })
})

describe('AC-directive-core-42, -43 — the core README documents navecss-core expand', () => {
  const expand = flat(section(coreReadme, '## `navecss-core expand`'))

  it('states the exit codes and that --out is not written on exit 1', () => {
    expect(expand).toMatch(/`0`/)
    expect(expand).toMatch(/`1`/)
    expect(expand).toMatch(/`2`/)
    expect(expand).toMatch(/`--out`[^.]*not written/)
  })

  it('states that it does not inline @import and that a bare specifier is an error naming the stylesheet to link', () => {
    expect(expand).toMatch(/does not (?:resolve or )?inline `@import`/)
    expect(expand).toContain(STANDALONE_PATH)
    expect(expand).toContain(STANDALONE_CDN)
  })

  it('names --source, --out, --extend and --watch, and that several files are repeated pairs matched by order', () => {
    for (const flag of ['--source', '--out', '--extend', '--watch']) expect(expand).toContain(flag)
    expect(expand).toMatch(/pairs/)
    expect(expand).toMatch(/by order/)
  })

  it('teaches it only inside package.json scripts, never as a bare npx line', () => {
    expect(coreReadme).not.toContain('npx navecss-core')
    const fences = extractFences(
      'packages/core/README.md',
      section(coreReadme, '## `navecss-core expand`'),
    )

    expect(
      fences.some((fence) => fence.lang === 'json' && fence.body.includes('navecss-core expand')),
    ).toBe(true)
  })
})

describe('navecss-core is run only from a package.json script, in every fence of both READMEs', () => {
  it.each([
    ['README.md', rootReadme],
    ['packages/core/README.md', coreReadme],
  ])('%s', (name, text) => {
    const outside = extractFences(name, text).filter(
      (fence) => fence.lang !== 'json' && /(^|[\s;&|])navecss-core\s/.test(fence.body),
    )

    expect(outside.map((fence) => fence.body)).toEqual([])
  })
})

describe('the setup steps name every route, with no route promised that is not shipped', () => {
  it('Requirements and the setup intro name the Lightning CSS adapter and the command', () => {
    const requirements = flat(section(coreReadme, '## Requirements'))
    const setup = flat(section(coreReadme, '## Setting up `@nave`'))

    expect(requirements).toContain('(#lightning-css-adapter-setup)')
    expect(setup).toContain('(#lightning-css-adapter-setup)')
    expect(setup).toContain('(#navecss-core-expand)')
  })

  it('names no host subpath that has no fixture', () => {
    for (const host of ['rspack', 'esbuild', 'rollup', 'rolldown', 'webpack', 'turbopack']) {
      expect(coreReadme).not.toContain(`@navecss/core/${host}`)
    }
  })
})
