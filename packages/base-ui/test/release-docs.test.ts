import { existsSync, readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

import { PACKAGE_DIR } from './support/stylesheet.ts'
import { sectionOf, zIndexProblems } from './support/w12-release.ts'

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
  const wrapperAdr = adrFiles.find((file) => file.includes('wrapper'))

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
    expect(text.replaceAll(/\s+/g, ' ')).toMatch(
      /no layer is renamed, reordered, removed or inserted/,
    )
  })

  it("carries the zero-runtime test in words in ADR 0004, and says Base UI's runtime is the peer's", () => {
    const text = adr('0004').replaceAll(/\s+/g, ' ')
    expect(text).toContain('chosen from a static table by props the consumer passed')
    expect(text).toContain('never computed from state, layout or measurement')
    expect(text).toMatch(/Base UI's own runtime \(inline styles, positioning\) is the peer's/)
  })

  it('gives ADR 0009 an Update section naming the package, its versioning, its peers and its bump', () => {
    const text = adr('0009')
    const update =
      text
        .split(/^## Update:/m)
        .slice(1)
        .find((section) => section.includes('@navecss/base-ui')) ?? ''
    expect(update, 'ADR 0009 has an Update section').not.toBe('')
    expect(update).toContain('@navecss/base-ui')
    expect(update).toMatch(/independent/i)
    expect(update).toMatch(/peer/i)
    expect(update).toMatch(/`minor`/)
  })

  it('adds no atom-map row to ADR 0006', () => {
    expect(adr('0006')).not.toMatch(/base[- ]?ui/i)
  })

  it('leaves the layer order and its names unchanged', () => {
    for (const file of ['packages/core/dist/layers.css', 'packages/tokens/dist/tokens.css']) {
      expect(firstBlocklessLayer(read(file)), file).toBe(LAYER_ORDER)
    }
  })

  it('control: a statement with one name moved is not the order', () => {
    expect(firstBlocklessLayer('@layer reset, tokens.defaults;')).not.toBe(LAYER_ORDER)
  })
})

describe('AC-base-ui-bridge-50: every sentence and config this release makes false is changed', () => {
  const readme = read('README.md')

  it('retires packages/bridge', () => {
    // A directory holding only installed dependencies can outlive the deletion in a working copy.
    expect(existsSync(path.join(ROOT, 'packages/bridge/package.json'))).toBe(false)
  })

  it('leaves Changesets ignoring the CLI only', () => {
    const config = JSON.parse(read('.changeset/config.json')) as { ignore: string[] }
    expect(config.ignore).toEqual(['@navecss/cli'])
  })

  it('names the new package in the publishable-set docblock, not the bridge', () => {
    const script = read('scripts/check-publishable-set.mjs')
    expect(script.replaceAll(/\n\s*\*\s*/g, ' ')).not.toMatch(/`@navecss\/bridge`\s+publishes/)
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
    'packages/core/README.md',
    'packages/tokens/README.md',
    'sonar-project.properties',
    'README.md',
    'docs/04-adr/index.md',
    'packages/core/test/no-inlined-dependency.test.ts',
  ])('has no sentence about the retired bridge in %s', (file) => {
    expect(read(file)).not.toMatch(/@navecss\/bridge|packages\/bridge|\bbridges?\b/i)
  })

  it("dates ADR 0008's correction that the bridge was retired", () => {
    expect(read('docs/04-adr/0008-test-placement.md').replaceAll(/\s+/g, ' ')).toMatch(
      /\*\*Correction \(2026-10-\d\d\):\*\* `@navecss\/bridge` was retired before it published/,
    )
  })

  it.each(['CLAUDE.md', 'docs/index.md'])(
    'says nothing about the first release that stops being true when it publishes, in %s',
    (file) => {
      expect(read(file)).not.toMatch(/first release pending/)
    },
  )

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

describe('AC-base-ui-feedback-navigation-17 (the docs clause): the ADR decisions that said the stylesheet sets no z-index', () => {
  const decisionOf0003 = sectionOf(adr('0003'), /^## Decision$/, /^## Consequences$/)
  const decisionTwoOf0010 = sectionOf(adr('0010'), /^\*\*2\. /, /^\*\*3\. /)

  const oldCorrection =
    '- **Correction (2026-09-30):** the entry shipped, and the stylesheet sets one `z-index` somewhere.'
  const goodCorrection =
    '- **Correction (2026-10-15):** the stylesheet sets one `z-index`, `z-index: var(--nave-layer-toast)` in `nave-base-ui-toast-placement`, the toast area. No layer is renamed, reordered, removed or inserted: the order is as before.'
  const claim = 'whose single stylesheet declares no custom property and sets no `z-index`.'

  it('reads the two decisions it checks', () => {
    expect(decisionOf0003).toContain('The contract is the seven names')
    expect(decisionTwoOf0010).toContain('The styling is one stylesheet')
  })

  it('has ADR 0003 decision 1 carry a dated correction that names the admitted declaration and says no layer moves', () => {
    expect(zIndexProblems(decisionOf0003, { needsCorrection: true })).toEqual([])
  })

  it('has ADR 0010 decision 2 carry a dated correction that names the admitted declaration and says no layer moves', () => {
    expect(zIndexProblems(decisionTwoOf0010, { needsCorrection: true })).toEqual([])
  })

  it('control: the sentence as it stood, with no correction beside it, is reported', () => {
    expect(zIndexProblems(claim, { needsCorrection: true })).toContain(
      'no dated correction about the z-index',
    )
    expect(zIndexProblems(claim, { needsCorrection: false })).toContain(
      'no dated correction about the z-index',
    )
  })

  it('control: the sentence changed to match but not naming the declaration is reported', () => {
    expect(
      zIndexProblems('whose single stylesheet sets one `z-index`.', { needsCorrection: false }),
    ).toContain('the decision does not name the admitted z-index declaration')
  })

  it('control: the sentence with a correction that names the declaration and says no layer moves is clean', () => {
    expect(zIndexProblems(`${claim}\n\n${goodCorrection}`, { needsCorrection: true })).toEqual([])
  })

  it('control: each real decision with a good correction appended is clean, so the checks read the real text', () => {
    expect(
      zIndexProblems(`${decisionOf0003}\n${goodCorrection}`, { needsCorrection: true }),
    ).toEqual([])
    expect(
      zIndexProblems(`${decisionTwoOf0010}\n\n${goodCorrection}`, { needsCorrection: false }),
    ).toEqual([])
  })

  it('control: a correction that is undated, or dated before the placement was signed, is reported', () => {
    const early = goodCorrection.replace('2026-10-15', '2026-09-30')
    expect(zIndexProblems(`${claim}\n\n${early}`, { needsCorrection: true })).toEqual([
      'the correction is dated 2026-09-30, before 2026-10-14',
    ])
    expect(zIndexProblems(`${claim}\n\n${oldCorrection}`, { needsCorrection: true })).toContain(
      'the correction does not name z-index with --nave-layer-toast',
    )
  })

  it('control: a correction that does not say no layer moves is reported', () => {
    const silent = goodCorrection.replace(/ No layer is renamed.*$/, '')
    expect(silent).not.toBe(goodCorrection)
    expect(zIndexProblems(`${claim}\n\n${silent}`, { needsCorrection: true })).toEqual([
      'the correction does not say that no layer moves',
    ])
  })

  it('control: a correction that does not name the toast placement is reported', () => {
    const vague = goodCorrection.replace(
      'in `nave-base-ui-toast-placement`, the toast area',
      'somewhere',
    )
    expect(zIndexProblems(`${claim}\n\n${vague}`, { needsCorrection: true })).toEqual([
      'the correction does not name the toast placement',
    ])
  })
})
