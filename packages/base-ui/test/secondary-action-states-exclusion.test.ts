/**
 * AC-secondary-action-states-10: the Button keys' exclusion list is the variant forms, read from
 * the one set the stylesheet's forms are compared with, so a variant that gains a rule of its own
 * reds here until both keys exclude it.
 */
import selectorParser from 'postcss-selector-parser'
import { describe, expect, it } from 'vitest'

import { DATA_NAVE_FORMS } from './support/data-nave-forms.ts'
import { BUTTON, BUTTON_KEYS, nestedRules } from './support/secondary-states.ts'
import { readStylesheet } from './support/stylesheet.ts'

const css = readStylesheet()

const byText = (a: string, b: string): number => a.localeCompare(b)

/**
The attribute forms the first `:not()` of a selector excludes, as written.
 */
const firstNotForms = (selector: string): string[] => {
  const forms: string[] = []
  selectorParser((root) => {
    const first = root.nodes[0]?.nodes.find(
      (node) => node.type === 'pseudo' && node.value === ':not',
    )
    if (first?.type !== 'pseudo') return
    for (const inner of first.nodes) forms.push(inner.toString().trim())
  }).processSync(selector)
  return forms.toSorted(byText)
}

const variantForms = (forms: ReadonlySet<string>): string[] =>
  [...forms]
    .filter((form) => form.startsWith('[data-nave-variant='))
    .filter((form) => form !== '[data-nave-variant="secondary"]')
    .toSorted(byText)

const exclusionProblems = (source: string, forms: ReadonlySet<string>): string[] => {
  const wanted = variantForms(forms)
  const keys = nestedRules(source, BUTTON)
    .map((rule) => rule.selector)
    .filter((selector) => /\):(?:hover|active):not\(:disabled/.test(selector))
    .filter((selector) => selector.startsWith('&:not('))
  const problems = keys.flatMap((key) => {
    const excluded = firstNotForms(key)
    return [
      ...wanted.filter((form) => !excluded.includes(form)).map((form) => `${key} lacks ${form}`),
      ...excluded
        .filter((form) => !wanted.includes(form))
        .map((form) => `${key} has extra ${form}`),
    ]
  })
  const [hover, active] = keys
  if (keys.length !== 2) problems.push(`expected two exclusion keys, found ${keys.length}`)
  else if (firstNotForms(hover ?? '').join(',') !== firstNotForms(active ?? '').join(',')) {
    problems.push(`the active key's list differs from the hover key's`)
  }
  return problems
}

describe('AC-secondary-action-states-10: the exclusion list is the variant forms, read from one source', () => {
  it('carries on both keys exactly the variant forms of DATA_NAVE_FORMS', () => {
    expect(exclusionProblems(css, DATA_NAVE_FORMS)).toEqual([])
    expect(BUTTON_KEYS.map((key) => firstNotForms(key))).toEqual([
      ['[data-nave-variant="ghost"]', '[data-nave-variant="primary"]'],
      ['[data-nave-variant="ghost"]', '[data-nave-variant="primary"]'],
    ])
  })

  it('reds on a form added to the set that the keys do not exclude, naming outline (control)', () => {
    const forms = new Set([...DATA_NAVE_FORMS, '[data-nave-variant="outline"]'])

    expect(exclusionProblems(css, forms).join('\n')).toContain(
      'lacks [data-nave-variant="outline"]',
    )
  })

  it('reds on keys that exclude primary only, naming ghost (control)', () => {
    const planted = css.replaceAll(', [data-nave-variant="ghost"]):', '):')

    expect(exclusionProblems(planted, DATA_NAVE_FORMS).join('\n')).toContain(
      'lacks [data-nave-variant="ghost"]',
    )
  })

  it('reds on keys that also exclude danger, naming danger (control)', () => {
    const planted = css.replaceAll(
      '[data-nave-variant="ghost"]):',
      '[data-nave-variant="ghost"], [data-nave-variant="danger"]):',
    )

    expect(exclusionProblems(planted, DATA_NAVE_FORMS).join('\n')).toContain(
      'has extra [data-nave-variant="danger"]',
    )
  })

  it('reds on hover and active keys that carry different lists, naming the active key (control)', () => {
    const active = BUTTON_KEYS[1]
    const planted = css.replace(active, () => active.replace(', [data-nave-variant="ghost"]', ''))

    expect(exclusionProblems(planted, DATA_NAVE_FORMS).join('\n')).toContain(
      `the active key's list differs`,
    )
  })
})
