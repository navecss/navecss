/**
 * AC-eslint-plugin-16 covers: R8, R4.
 */
import { RuleTester } from 'eslint'
import { describe, it } from 'vitest'

import { rawReasonRule } from '../src/rules/raw-reason.ts'

const languageOptions = {
  ecmaVersion: 2024 as const,
  sourceType: 'module' as const,
  parserOptions: { ecmaFeatures: { jsx: true } },
}

const { parser: tsParser } = await import('typescript-eslint')

const tsLanguageOptions = {
  ...languageOptions,
  parser: tsParser,
}

const ruleTester = new RuleTester()
const settings = { '@navecss': { allow: ['app-'] } }
const PRELUDE = `import { cx } from '@navecss/core/cx'\nimport { cx as ncx } from '@navecss/core/cx'\n`

function jsxWith(expr: string): string {
  return `${PRELUDE}const el = <div className={${expr}} />`
}

describe('AC-16: cx.raw() reason placement and content', () => {
  const valid: { code: string; note: string }[] = [
    {
      note: 'a valid reason, first inside parens',
      code: jsxWith(
        "cx.raw(/* nave-escape: vendor date picker renders this class */ 'legacy-card')",
      ),
    },
    {
      note: 'a valid reason as a line comment, first inside parens',
      code: `${PRELUDE}const el = <div className={cx.raw(\n  // nave-escape: vendor date picker\n  'legacy-card'\n)} />`,
    },
    {
      note: 'a reasoned call inside a template slot',
      code: jsxWith("`${cx.raw(/* nave-escape: 42 */ 'legacy-card')}`"),
    },
    { note: 'composition: member behind &&', code: jsxWith('cx.raw(isActive && styles.active)') },
    {
      note: 'composition: multiple members/conditional',
      code: jsxWith('cx.raw(styles.a, on ? styles.b : styles.c)'),
    },
    { note: 'composition: computed member', code: jsxWith('cx.raw(styles[v])') },
    { note: 'composition: identifier (forwarded prop)', code: jsxWith('cx.raw(className)') },
    { note: 'composition: member identifier', code: jsxWith('cx.raw(props.className)') },
    { note: 'composition: a call', code: jsxWith('cx.raw(getClass())') },
    { note: 'declared by R6', code: jsxWith("cx.raw('app-shell')") },
    {
      note: 'a non-Nave x.raw() is not this rule’s concern',
      code: `${PRELUDE}const el = <div className={x.raw('legacy-card')} />`,
    },
  ]

  for (const { note, code } of valid) {
    it(`passes: ${note}`, () => {
      ruleTester.run('raw-reason', rawReasonRule, {
        valid: [{ code, languageOptions, settings }],
        invalid: [],
      })
    })
  }

  it('missing: a bare cx.raw literal with no comment at all', () => {
    ruleTester.run('raw-reason', rawReasonRule, {
      valid: [],
      invalid: [
        {
          code: jsxWith("cx.raw('legacy-card')"),
          languageOptions,
          settings,
          errors: [{ messageId: 'missing' }],
        },
      ],
    })
  })

  it('misplaced: reason before the call', () => {
    ruleTester.run('raw-reason', rawReasonRule, {
      valid: [],
      invalid: [
        {
          code: `${PRELUDE}const el = <div className={/* nave-escape: x */ cx.raw('legacy-card')} />`,
          languageOptions,
          settings,
          errors: [{ messageId: 'misplaced' }],
        },
      ],
    })
  })

  it('misplaced: reason nested in an argument', () => {
    ruleTester.run('raw-reason', rawReasonRule, {
      valid: [],
      invalid: [
        {
          code: jsxWith("cx.raw(on && /* nave-escape: x */ 'legacy-card')"),
          languageOptions,
          settings,
          errors: [{ messageId: 'misplaced' }],
        },
      ],
    })
  })

  it('missing (not misplaced): reason after the call, or above the statement', () => {
    ruleTester.run('raw-reason', rawReasonRule, {
      valid: [],
      invalid: [
        {
          code: `${jsxWith("cx.raw('legacy-card')")} /* nave-escape: x */`,
          languageOptions,
          settings,
          errors: [{ messageId: 'missing' }],
        },
        {
          code: `${PRELUDE}// nave-escape: x\nconst k = cx.raw('legacy-card')`,
          languageOptions: tsLanguageOptions,
          settings,
          errors: [{ messageId: 'missing' }],
        },
        {
          code: jsxWith("cx.raw('legacy-card', // nave-escape: x\n  undefined)"),
          languageOptions,
          settings,
          errors: [{ messageId: 'missing' }],
        },
      ],
    })
  })

  it('missing: a comment lacking the marker, the colon, letters/digits, or matching a filler', () => {
    ruleTester.run('raw-reason', rawReasonRule, {
      valid: [],
      invalid: [
        {
          code: jsxWith("cx.raw(/* x */ /* nave-escape: vendor */ 'legacy-card')"),
          languageOptions,
          settings,
          errors: [{ messageId: 'missing' }],
        },
        {
          code: jsxWith("cx.raw(/* nave-escape:    */ 'legacy-card')"),
          languageOptions,
          settings,
          errors: [{ messageId: 'missing' }],
        },
        {
          code: jsxWith("cx.raw(/* nave-escape: -- */ 'legacy-card')"),
          languageOptions,
          settings,
          errors: [{ messageId: 'missing' }],
        },
        {
          code: jsxWith("cx.raw(/* TODO later */ 'legacy-card')"),
          languageOptions,
          settings,
          errors: [{ messageId: 'missing' }],
        },
        {
          code: jsxWith("cx.raw(/* nave-escape vendor */ 'legacy-card')"),
          languageOptions,
          settings,
          errors: [{ messageId: 'missing' }],
        },
        {
          code: jsxWith("cx.raw(/* nave-raw: vendor */ 'legacy-card')"),
          languageOptions,
          settings,
          errors: [{ messageId: 'missing' }],
        },
        {
          code: jsxWith("cx.raw(/* nave-escape: reason */ 'legacy-card')"),
          languageOptions,
          settings,
          errors: [{ messageId: 'missing' }],
        },
        {
          code: jsxWith("cx.raw(/* nave-escape: TODO */ 'legacy-card')"),
          languageOptions,
          settings,
          errors: [{ messageId: 'missing' }],
        },
        {
          code: jsxWith("cx.raw(/* nave-escape:   Wip   */ 'legacy-card')"),
          languageOptions,
          settings,
          errors: [{ messageId: 'missing' }],
        },
        {
          code: jsxWith("cx.raw(/* nave-escape: N/A */ 'legacy-card')"),
          languageOptions,
          settings,
          errors: [{ messageId: 'missing' }],
        },
        {
          code: jsxWith("cx.raw(/* nave-escape: fixme */ 'legacy-card')"),
          languageOptions,
          settings,
          errors: [{ messageId: 'missing' }],
        },
      ],
    })
  })

  it('passes: a reason that merely starts with a filler word, by equality not substring', () => {
    ruleTester.run('raw-reason', rawReasonRule, {
      valid: [
        {
          code: jsxWith("cx.raw(/* nave-escape: todo: vendor widget */ 'legacy-card')"),
          languageOptions,
          settings,
        },
        {
          code: jsxWith("cx.raw(/* nave-escape: reasons */ 'legacy-card')"),
          languageOptions,
          settings,
        },
      ],
      invalid: [],
    })
  })

  it('one comment, one call: the inner cx.raw() call is reported, not the outer', () => {
    ruleTester.run('raw-reason', rawReasonRule, {
      valid: [],
      invalid: [
        {
          code: jsxWith("cx.raw(/* nave-escape: outer */ cx.raw('legacy-card'))"),
          languageOptions,
          settings,
          errors: 1,
        },
      ],
    })
  })

  it('recognises cx.raw however reached, one hop', () => {
    ruleTester.run('raw-reason', rawReasonRule, {
      valid: [],
      invalid: [
        { code: jsxWith("ncx.raw('legacy-card')"), languageOptions, settings, errors: 1 },
        { code: jsxWith("cx['raw']('legacy-card')"), languageOptions, settings, errors: 1 },
        {
          code: `${PRELUDE}const { raw } = cx\nconst el = <div className={raw('legacy-card')} />`,
          languageOptions,
          settings,
          errors: 1,
        },
      ],
    })
  })

  it('is not scoped to className: a .ts file with no JSX is checked', () => {
    ruleTester.run('raw-reason', rawReasonRule, {
      valid: [],
      invalid: [
        {
          code: `${PRELUDE}const k = cx.raw('legacy-card')`,
          languageOptions: tsLanguageOptions,
          settings,
          errors: [{ messageId: 'missing' }],
        },
      ],
    })
  })
})
