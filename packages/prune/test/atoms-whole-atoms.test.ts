import { inspectAtomicLayer, pruneAtomicLayer } from '@navecss/core/collect'
import postcss from 'postcss'
import { describe, expect, it } from 'vitest'

import { CX_IMPORT, runScenario, useScratchProjects } from './helpers/atoms-fixture.ts'
import {
  atomsNamedBy,
  compareLayers,
  entriesOf,
  entryKey,
  flattenAtomic,
} from './helpers/atoms-flatten.ts'
import { ATOMIC_CSS, recordOf } from './helpers/project.ts'

const EMITTED = ['focusRing', 'srOnlyFocusable']

const SCENARIO = {
  files: {
    'app/layout.tsx': [
      'export default function Layout({ children }) {',
      '  return (',
      '    <html><body>',
      '      <a href="#main" className="nave-sr-only-focusable">Skip to content</a>',
      '      {children}',
      '    </body></html>',
      '  )',
      '}',
    ].join('\n'),
    'app/page.tsx': [
      CX_IMPORT,
      "export default function Page() { return <button className={cx('focusRing')} /> }",
    ].join('\n'),
  },
}

/**
 * The declarations of the entry with this selector in the layer, or an empty list.
 */
function declarationsOf(css: string, selector: string): readonly string[] {
  const entry = flattenAtomic(css).find((candidate) => candidate.selector === selector)
  return entry?.declarations ?? []
}

/**
 * The outline declarations among `declarations`.
 */
function outlines(declarations: readonly string[]): string[] {
  return declarations.filter((line) => line.startsWith('outline'))
}

/**
 * A scratch trimmed layer: `focusRing`'s nested rule moved under the rule of `.nave-flex`.
 */
function withFocusRingMovedUnderFlex(): string {
  const nested = /\n {4}&:focus-visible \{\n {6}outline-style[\s\S]*?\n {4}\}\n/
  const block = nested.exec(ATOMIC_CSS)?.[0]
  if (block === undefined) throw new Error('focusRing has no nested rule in core atomic.css')
  const kept = pruneAtomicLayer(ATOMIC_CSS, new Set(['flex', ...EMITTED]))
  const without = kept.replace(nested, '\n')
  return without.replace('.nave-flex {\n    display: flex;\n', (head) => `${head}${block}`)
}

/**
 * The raw key a flattener that leaves nested selectors unresolved gives each rule of the atoms it
 * is asked about, owning a nested rule by the outermost rule it sits in.
 */
function unresolvedKeys(css: string, owners: ReadonlySet<string> | undefined): Set<string> {
  const keys = new Set<string>()
  const root = postcss.parse(css)
  root.walkRules((rule) => {
    let top = rule
    while (top.parent?.type === 'rule') top = top.parent
    if (owners && atomsNamedBy(top.selector).every((atom) => !owners.has(atom))) return
    const own = rule.nodes.filter((node) => node.type === 'decl')
    keys.add(`${rule.selector} | ${own.map((node) => `${node.prop}: ${node.value}`).join('; ')}`)
  })
  return keys
}

describe('AC-nextjs-used-atoms-33 the trimmed layer holds whole atoms', () => {
  const create = useScratchProjects()

  it('AC-nextjs-used-atoms-33 emits focusRing and the skip link atom only', async () => {
    const { project } = await runScenario(create, SCENARIO)
    expect(recordOf(project).atoms).toEqual(EMITTED)
  })

  it('AC-nextjs-used-atoms-33 keeps every entry of an emitted atom and no entry of another', async () => {
    const { css } = await runScenario(create, SCENARIO)
    expect(compareLayers(css, ATOMIC_CSS, EMITTED)).toEqual({
      missing: [],
      outside: [],
      unexpected: [],
    })
  })

  it('AC-nextjs-used-atoms-33 keeps the focus-visible entry of focusRing with its outline declarations', async () => {
    const { css } = await runScenario(create, SCENARIO)
    const selector = '.nave-focus-ring:focus-visible'
    const expected = outlines(declarationsOf(ATOMIC_CSS, selector))
    expect(expected.some((line) => line.startsWith('outline-offset'))).toBe(true)
    expect(outlines(declarationsOf(css, selector))).toEqual(expected)
  })

  it('AC-nextjs-used-atoms-33 keeps the hiding entry and both reveal entries of srOnlyFocusable', async () => {
    const { css } = await runScenario(create, SCENARIO)
    const selectors = flattenAtomic(css).map((entry) => entry.selector)
    expect(selectors).toEqual(
      expect.arrayContaining([
        '.nave-sr-only-focusable',
        '.nave-sr-only-focusable:focus-visible',
        '.nave-sr-only-focusable:focus-within',
      ]),
    )
  })

  it('AC-nextjs-used-atoms-33 has no entry naming srOnly, while the full layer has some', async () => {
    const { css } = await runScenario(create, SCENARIO)
    expect(entriesOf(flattenAtomic(ATOMIC_CSS), 'srOnly').length).toBeGreaterThan(0)
    expect(entriesOf(flattenAtomic(css), 'srOnly')).toEqual([])
  })
})

describe('AC-nextjs-used-atoms-33 the flattener', () => {
  it('AC-nextjs-used-atoms-33 resolves a nested selector against its parent', () => {
    const entries = flattenAtomic(ATOMIC_CSS)
    const selectors = entries.map((entry) => entry.selector)
    expect(selectors).toContain('.nave-focus-ring:focus-visible')
    expect(selectors.filter((selector) => selector.includes('&'))).toEqual([])
    expect(atomsNamedBy('.nave-sr-only-focusable:focus-within')).toEqual(['srOnlyFocusable'])
  })

  it('AC-nextjs-used-atoms-33 resolves a nested selector the same when it is written out', () => {
    const nested = '@layer atomic { .a { color: red; &:hover { color: blue } } }'
    const written = '@layer atomic { .a { color: red } .a:hover { color: blue } }'
    expect(flattenAtomic(nested).map((entry) => entryKey(entry))).toEqual(
      flattenAtomic(written).map((entry) => entryKey(entry)),
    )
  })

  it('AC-nextjs-used-atoms-33 keeps the enclosing at-rules of an entry', () => {
    const css = '@layer atomic { @media (width >= 40em) { .a { &:hover { color: blue } } } }'
    expect(flattenAtomic(css)).toEqual([
      {
        atRules: ['@media (width >= 40em)'],
        declarations: ['color: blue'],
        selector: '.a:hover',
      },
    ])
  })

  it('AC-nextjs-used-atoms-33 control: a nested rule moved under another atom is seen only when resolved', () => {
    const scratch = withFocusRingMovedUnderFlex()
    const emitted = ['flex', ...EMITTED]
    expect(scratch).not.toBe(pruneAtomicLayer(ATOMIC_CSS, new Set(emitted)))
    expect(flattenAtomic(scratch).map((entry) => entry.selector)).toContain(
      '.nave-flex:focus-visible',
    )

    const owners = new Set(emitted)
    const unresolved = unresolvedKeys(scratch, undefined)
    const wantedRaw = [...unresolvedKeys(ATOMIC_CSS, owners)]
    expect(wantedRaw.filter((key) => !unresolved.has(key))).toEqual([])

    const resolved = compareLayers(scratch, ATOMIC_CSS, emitted)
    expect(resolved.missing.some((key) => key.includes('.nave-focus-ring:focus-visible'))).toBe(
      true,
    )
    expect(resolved.unexpected.some((key) => key.includes('.nave-flex:focus-visible'))).toBe(true)
  })

  it('AC-nextjs-used-atoms-33 control: a split atom is seen by the comparison, not by the layer reading', () => {
    const whole = pruneAtomicLayer(ATOMIC_CSS, new Set(EMITTED))
    const nested = /\n {4}&:focus-visible \{\n {6}outline-style[\s\S]*?\n {4}\}\n/
    const split = whole.replace(nested, '\n')
    expect(split).not.toBe(whole)
    expect([...inspectAtomicLayer(split).atoms]).toContain('focusRing')
    expect(compareLayers(whole, ATOMIC_CSS, EMITTED).missing).toEqual([])
    expect(
      compareLayers(split, ATOMIC_CSS, EMITTED).missing.some((key) =>
        key.includes('.nave-focus-ring:focus-visible'),
      ),
    ).toBe(true)
  })
})
