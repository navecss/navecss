import { existsSync, readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

import { PACKAGE_DIR } from './support/stylesheet.ts'

const ROOT = path.join(PACKAGE_DIR, '../..')
const read = (...segments: string[]): string => readFileSync(path.join(ROOT, ...segments), 'utf8')

const ADR_DIR = path.join(ROOT, 'docs/04-adr')
const adrFiles = readdirSync(ADR_DIR).filter((file) => /^\d{4}-.*\.md$/.test(file))
const adr = (number: string): string => {
  const matches = adrFiles.filter((file) => file.startsWith(`${number}-`))
  expect(matches, `ADR ${number} is unique`).toHaveLength(1)
  return readFileSync(path.join(ADR_DIR, matches[0] ?? ''), 'utf8')
}

const LAYER_ORDER =
  'tokens.defaults, tokens.presets, reset, atomic, components.nave, components.consumer, overrides'

const firstBlocklessLayer = (css: string): string | undefined =>
  /@layer\s+([^{};]+);/.exec(css.replaceAll(/\/\*[\s\S]*?\*\//g, ''))?.[1]?.trim()

describe('AC-base-ui-bridge-49: the ADRs this release owes', () => {
  const index = read('docs/04-adr/index.md')
  const wrapperAdr = adrFiles.find((file) => /wrapper/.test(file))

  it('has a new ADR rendering the wrapper-package decision, with a row in the index', () => {
    expect(wrapperAdr).toBeDefined()
    const text = readFileSync(path.join(ADR_DIR, wrapperAdr ?? ''), 'utf8')
    expect(text).toMatch(/wrapper package/i)
    expect(text).toMatch(/registry/i)
    expect(text).toContain('@navecss/base-ui')
    expect(index).toContain(`(${wrapperAdr})`)
  })

  it('numbers its ADRs uniquely', () => {
    const numbers = adrFiles.map((file) => file.slice(0, 4))
    expect(new Set(numbers).size).toBe(numbers.length)
  })

  it('no longer lists the headless-bridge approach as still to back-fill', () => {
    expect(index).not.toMatch(/headless-bridge approach/)
  })

  it("names @navecss/base-ui as components.nave's writer in ADR 0003 and drops the bridge from tokens.defaults", () => {
    const text = adr('0003')
    const row = (layer: string): string =>
      text.split('\n').find((line) => line.startsWith(`| \`${layer}\``)) ?? ''
    expect(row('components.nave')).toContain('@navecss/base-ui')
    expect(row('tokens.defaults')).not.toContain('@navecss/bridge')
    expect(row('tokens.defaults')).toContain('@navecss/tokens')
    expect(text).not.toMatch(/`@navecss\/bridge` maps third-party variable names/)
    expect(text).toMatch(/Correction \(2026-10-\d\d\)/)
    expect(text).toMatch(/no layer is renamed, reordered, removed or inserted/)
  })

  it("carries the zero-runtime test in words in ADR 0004, and says Base UI's runtime is the peer's", () => {
    const text = adr('0004').replaceAll(/\s+/g, ' ')
    expect(text).toContain('chosen from a static table by props the consumer passed')
    expect(text).toContain('never computed from state, layout or measurement')
    expect(text).toMatch(/Base UI's own runtime \(inline styles, positioning\) is the peer's/)
  })

  it('gives ADR 0009 an Update section naming the package, its versioning, its peers and its bump', () => {
    const text = adr('0009')
    const update = text.split(/^## Update:/m)[1] ?? ''
    expect(update, 'ADR 0009 has an Update section').not.toBe('')
    expect(update).toContain('@navecss/base-ui')
    expect(update).toMatch(/independent/i)
    expect(update).toMatch(/peer/i)
    expect(update).toMatch(/`minor`/)
  })

  it('adds no atom-map row to ADR 0006', () => {
    expect(adr('0006')).not.toMatch(/base-ui/i)
  })

  it('leaves the layer order and its names unchanged', () => {
    expect(
      firstBlocklessLayer(readFileSync(path.join(ROOT, 'packages/core/dist/layers.css'), 'utf8')),
    ).toBe(LAYER_ORDER)
    expect(
      firstBlocklessLayer(readFileSync(path.join(ROOT, 'packages/tokens/dist/tokens.css'), 'utf8')),
    ).toBe(LAYER_ORDER)
  })

  it('control: a statement with one name moved is not the order', () => {
    expect(firstBlocklessLayer('@layer reset, tokens.defaults;')).not.toBe(LAYER_ORDER)
  })
})

describe('AC-base-ui-bridge-50: every sentence and config this release makes false is changed', () => {
  const readme = read('README.md')

  it('retires packages/bridge', () => {
    expect(existsSync(path.join(ROOT, 'packages/bridge'))).toBe(false)
  })

  it('leaves Changesets ignoring the CLI only', () => {
    expect(JSON.parse(read('.changeset/config.json')).ignore).toEqual(['@navecss/cli'])
  })

  it('names the new package in the publishable-set docblock, not the bridge', () => {
    const script = read('scripts/check-publishable-set.mjs')
    expect(script).not.toContain('`@navecss/bridge` publishes')
    expect(script).toContain('@navecss/base-ui')
  })

  it.each([
    'commitlint.config.js',
    '.github/workflows/pr-title.yml',
    '.github/CONTRIBUTING.md',
    'scripts/check-dependabot-commit-scope.test.mjs',
    'scripts/check-pr-title-scopes.test.mjs',
  ])('has the base-ui commit scope and no bridge scope in %s', (file) => {
    const text = read(file)
    expect(text).not.toMatch(/\bbridge\b/)
  })

  it('lists base-ui among the commit scopes where they are listed', () => {
    for (const file of [
      'commitlint.config.js',
      '.github/workflows/pr-title.yml',
      '.github/CONTRIBUTING.md',
    ]) {
      expect(read(file), file).toMatch(/\bbase-ui\b/)
    }
  })

  it('no longer counts the bridge among the packages that run stylelint', () => {
    expect(read('packages/stylelint-config/test/root-integration.test.ts')).not.toContain(
      '@navecss/bridge',
    )
    expect(read('.stylelintrc.json')).not.toContain('packages/bridge')
  })

  it.each([
    'CLAUDE.md',
    'docs/index.md',
    'docs/01-getting-started/index.md',
    'docs/02-contribute/index.md',
    'docs/02-contribute/releasing.md',
    'docs/03-tech-docs/index.md',
    'docs/04-adr/0009-release-topology.md',
    'packages/core/README.md',
    'packages/tokens/README.md',
    'sonar-project.properties',
  ])('has no sentence about the retired bridge in %s', (file) => {
    expect(read(file)).not.toMatch(/@navecss\/bridge|packages\/bridge|\bbridges?\b/i)
  })

  it('describes the new package in the places a reader learns the packages', () => {
    expect(read('CLAUDE.md')).toContain('packages/base-ui/')
    expect(read('docs/index.md')).toContain('packages/base-ui')
    expect(readme).toMatch(/\| \[?`@navecss\/base-ui`/)
  })

  it('says what the README Headless bullet means: Base UI and Radix each in their own clause', () => {
    const bullet = readme.slice(
      readme.indexOf('- **Headless components**'),
      readme.indexOf('Markup stays semantic'),
    )
    expect(bullet).toContain('@navecss/base-ui')
    expect(bullet).toMatch(/Radix[^.]*no Nave package/)
    expect(bullet).not.toMatch(/ships no integration with Base UI or Radix/)
  })

  it('no longer says the shipped library is not a component library, or that it has no components', () => {
    expect(readme).not.toContain('not a component library to configure')
    expect(readme).not.toContain('If you want hundreds of ready-made components, this is not that.')
    expect(readme).not.toContain('a component library that owns\nyour styles (MUI, Chakra).')
    expect(readme).not.toMatch(/^Built on web standards\. Zero runtime\.$/m)
    expect(readme).toContain('zero-runtime styling')
    expect(readme).not.toContain(
      'Anything about the component registry, until components exist and have\n   been reviewed one by one.',
    )
  })
})
