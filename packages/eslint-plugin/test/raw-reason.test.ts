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

  it('missing (not misplaced): reason above the statement', () => {
    ruleTester.run('raw-reason', rawReasonRule, {
      valid: [],
      invalid: [
        {
          code: `${PRELUDE}// nave-escape: x\nconst k = cx.raw('legacy-card')`,
          languageOptions: tsLanguageOptions,
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

describe('AC-16 (R8): a helper or Nave cx() call inside cx.raw() is read through its arguments', () => {
  const HELPERS = `${PRELUDE}import clsx from 'clsx'\n`
  const withHelpers = (expr: string): string => `${HELPERS}const el = <div className={${expr}} />`

  it('passes composition through a helper or cx(), and a reason before the helper call', () => {
    ruleTester.run('raw-reason', rawReasonRule, {
      valid: [
        'cx.raw(clsx(styles.a, on && styles.b))',
        "cx.raw(clsx('app-shell'))",
        "cx.raw(cx('flex'))",
        "cx.raw(/* nave-escape: vendor */ clsx('legacy-card'))",
        'cx.raw(getClass())',
      ].map((expr) => ({ code: withHelpers(expr), languageOptions, settings })),
      invalid: [],
    })
  })

  it('needs a reason for a literal inside a helper or cx(); one inside the inner call is misplaced', () => {
    ruleTester.run('raw-reason', rawReasonRule, {
      valid: [],
      invalid: [
        {
          code: withHelpers("cx.raw(clsx('legacy-card'))"),
          languageOptions,
          settings,
          errors: [{ messageId: 'missing' }],
        },
        {
          code: withHelpers("cx.raw(cx('legacy-card'))"),
          languageOptions,
          settings,
          errors: [{ messageId: 'missing' }],
        },
        {
          code: withHelpers("cx.raw(clsx(/* nave-escape: vendor */ 'legacy-card'))"),
          languageOptions,
          settings,
          errors: [{ messageId: 'misplaced' }],
        },
      ],
    })
  })
})

describe('AC-16 (R4): the messages rule 2 prints', () => {
  it('the missing message quotes the class, names the remedies in order with the reason last, and prints the callee as written', () => {
    ruleTester.run('raw-reason', rawReasonRule, {
      valid: [],
      invalid: [
        {
          code: `${PRELUDE}const k = ncx.raw('legacy-card')`,
          languageOptions,
          settings,
          errors: [
            {
              message:
                '"legacy-card" in ncx.raw() is class text this project does not declare as its own. Prefer, in order: a CSS Module class (styles.x), a Nave atom through cx(), a class the project declares as its own (declared: prefix app-), and only then a reason, first inside the parentheses: ncx.raw(/* nave-escape: ... */ \'legacy-card\').',
            },
          ],
        },
      ],
    })
  })

  it('a cx() argument inside cx.raw() that is not an atom is named as such, quoting the inner call, even when the project declares the class', () => {
    ruleTester.run('raw-reason', rawReasonRule, {
      valid: [],
      invalid: [
        {
          code: `${PRELUDE}const k = cx.raw(cx('app-card'))`,
          languageOptions,
          settings,
          errors: [
            {
              message:
                "cx('app-card') in cx.raw() is not a Nave atom: a string passed to cx() must name one. Prefer, in order: a CSS Module class (styles.x), a Nave atom through cx(), a class the project declares as its own (declared: prefix app-), and only then a reason, first inside the parentheses: cx.raw(/* nave-escape: ... */ cx('app-card')).",
            },
          ],
        },
        {
          code: `${PRELUDE}const k = cx.raw(ncx('legacy-card'))`,
          languageOptions,
          settings,
          errors: [
            {
              message:
                /^ncx\('legacy-card'\) in cx\.raw\(\) is not a Nave atom: a string passed to ncx\(\) must name one\./,
            },
          ],
        },
      ],
    })
  })

  it('an array passed to cx() inside cx.raw() gets the array explanation, not the string one', () => {
    ruleTester.run('raw-reason', rawReasonRule, {
      valid: [],
      invalid: [
        {
          code: `${PRELUDE}const k = cx.raw(cx(['legacy']))`,
          languageOptions,
          settings,
          errors: [
            {
              message:
                /^cx\(\['legacy'\]\) in cx\.raw\(\) is not a Nave atom: cx\(\) maps each argument whole, so an array or object is stringified first: .* only then a reason/,
            },
          ],
        },
      ],
    })
  })

  it('a nave- literal names its atom (R4(e)) before the reason', () => {
    ruleTester.run('raw-reason', rawReasonRule, {
      valid: [],
      invalid: [
        {
          code: `${PRELUDE}const k = cx.raw('nave-flex')`,
          languageOptions,
          settings,
          errors: [
            {
              message:
                /^"nave-flex" is a class Nave's own build outputs, not one you write: it is not seen as input\. Write the atom instead: @nave flex or cx\('flex'\)\..* only then a reason/,
            },
          ],
        },
      ],
    })
  })

  it('the misplaced message says where the reason goes, printing the call as written', () => {
    ruleTester.run('raw-reason', rawReasonRule, {
      valid: [],
      invalid: [
        {
          code: `${PRELUDE}const k = /* nave-escape: x */ ncx.raw('legacy-card')`,
          languageOptions,
          settings,
          errors: [
            {
              message:
                "A nave-escape reason counts only as the first thing inside ncx.raw()'s parentheses, before any argument: ncx.raw(/* nave-escape: ... */ 'legacy-card').",
            },
          ],
        },
      ],
    })
  })
})

describe("AC-16 (R8): the reason comment's accepted forms and misplaced markers", () => {
  it('accepts a /** */ reason, a multi-line block reason with leading asterisks, and a Unicode letter', () => {
    ruleTester.run('raw-reason', rawReasonRule, {
      valid: [
        "cx.raw(/** nave-escape: vendor date picker */ 'legacy-card')",
        "cx.raw(/*\n * nave-escape: vendor date picker\n */ 'legacy-card')",
        "cx.raw(/**\n * nave-escape: vendor\n * date picker\n */ 'legacy-card')",
        "cx.raw(/* nave-escape: é */ 'legacy-card')",
        "cx.raw(/* nave-escape: 日付 */ 'legacy-card')",
      ].map((expr) => ({ code: jsxWith(expr), languageOptions, settings })),
      invalid: [],
    })
  })

  it('a marker inside the parentheses but not first, or after the call, gets the misplaced message', () => {
    ruleTester.run('raw-reason', rawReasonRule, {
      valid: [],
      invalid: [
        "cx.raw('legacy-card' /* nave-escape: vendor */)",
        "cx.raw(styles.a, /* nave-escape: vendor */ 'legacy-card')",
        "cx.raw(/* x */ /* nave-escape: vendor */ 'legacy-card')",
        "cx.raw('legacy-card', // nave-escape: x\n)",
        "cx.raw('legacy-card') /* nave-escape: vendor */",
      ].map((expr) => ({
        code: jsxWith(expr),
        languageOptions,
        settings,
        errors: [{ messageId: 'misplaced' }],
      })),
    })
  })
})
