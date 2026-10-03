/**
 * Rule 1 reads the values an inline function returns when the function is a whole `className`
 * value (the form Base UI parts accept: `className={(state) => ...}`).
 */
import { RuleTester } from 'eslint'
import { describe } from 'vitest'

import { classChannelRule } from '../src/rules/class-channel.ts'

const languageOptions = {
  ecmaVersion: 2024 as const,
  sourceType: 'module' as const,
  parserOptions: { ecmaFeatures: { jsx: true } },
}

const cxImport = `import { cx } from '@navecss/core/cx'; `
const ruleTester = new RuleTester()

describe('rule 1: a function className is read through its returned values', () => {
  describe('an expression-bodied arrow', () => {
    ruleTester.run('class-channel', classChannelRule, {
      valid: [
        {
          code: `const x = <div className={(s) => (s.open ? 'app-open' : 'app-closed')} />`,
          languageOptions,
          settings: { '@navecss': { allow: ['app-'] } },
        },
        {
          code: `const x = <div className={(s) => s.className} />`,
          languageOptions,
        },
        {
          code: `${cxImport}const x = <div className={(s) => (s.open ? cx('flex') : cx('grid'))} />`,
          languageOptions,
        },
        {
          // `cx.raw()` is the declared escape, here as everywhere
          code: `${cxImport}const x = <div className={(s) => cx.raw(/* nave-escape: a vendor widget styles this class */ 'legacy-card')} />`,
          languageOptions,
        },
      ],
      invalid: [
        {
          code: `const x = <div className={(s) => (s.open ? 'is-open' : '')} />`,
          languageOptions,
          errors: [{ message: /^"is-open" is not a CSS Module class/u }],
        },
        {
          code: `const x = <div className={(s) => (s.open ? 'is-open' : 'is-closed')} />`,
          languageOptions,
          errors: 2,
        },
        {
          code: `const x = <div className={(s) => s.open && 'is-open'} />`,
          languageOptions,
          errors: 1,
        },
        {
          code: `const x = <div className={(s) => s.extra || 'is-fallback'} />`,
          languageOptions,
          errors: 1,
        },
        {
          code: `const x = <div className={(s) => \`legacy-\${s.state}\`} />`,
          languageOptions,
          errors: 1,
        },
        {
          code: `${cxImport}const x = <div className={(s) => cx(s.open ? 'bananas' : 'flex')} />`,
          languageOptions,
          errors: 1,
        },
        {
          code: `const x = <div class={(s) => (s.open ? 'is-open' : undefined)} />`,
          languageOptions,
          errors: 1,
        },
        {
          code: `const x = <div className={(s) => 'legacy-' + s.variant} />`,
          languageOptions,
          errors: 1,
        },
        {
          code: `const x = <div className={(s) => s.extra ?? 'is-fallback'} />`,
          languageOptions,
          errors: 1,
        },
      ],
    })
  })

  describe('a block-bodied arrow or a function expression', () => {
    ruleTester.run('class-channel', classChannelRule, {
      valid: [
        {
          code: `const x = <div className={(s) => { if (s.open) return 'app-open'; return undefined }} />`,
          languageOptions,
          settings: { '@navecss': { allow: ['app-'] } },
        },
        {
          // a nested function's return is not this function's value
          code: `const x = <div className={(s) => { const names = s.list.map(() => 'inner-class'); return s.join(names) }} />`,
          languageOptions,
        },
        {
          // a bare `return;` returns nothing to read
          code: `const x = <div className={(s) => { if (!s.open) return; return s.className }} />`,
          languageOptions,
        },
      ],
      invalid: [
        {
          code: `const x = <div className={(s) => { if (s.open) return 'is-open'; return 'is-closed' }} />`,
          languageOptions,
          errors: 2,
        },
        {
          code: `const x = <div className={function (s) { return s.open ? 'is-open' : undefined }} />`,
          languageOptions,
          errors: 1,
        },
        {
          // a `const` inside the function is followed one hop, as a `const` outside it is
          code: `const x = <div className={(s) => { const name = 'legacy-card'; return s.open ? name : undefined }} />`,
          languageOptions,
          errors: 1,
        },
        {
          code: `const x = <div className={(s) => { switch (s.state) { case 'a': return 'is-a'; default: return 'is-b' } }} />`,
          languageOptions,
          errors: 2,
        },
        {
          // returns of nested functions, methods and getters are theirs, not this function's
          code: `const x = <div className={(s) => { function inner() { return 'inner-decl' } const fn = function () { return 'inner-expr' }; const o = { get g() { return 'inner-get' }, m() { return 'inner-method' } }; return s.open ? 'is-outer' : inner() + fn() + o.g + o.m() }} />`,
          languageOptions,
          errors: [{ message: /^"is-outer" is not a CSS Module class/u }],
        },
        {
          code: `const x = <div className={(s) => { try { return 'is-try' } catch { return 'is-catch' } }} />`,
          languageOptions,
          errors: 2,
        },
        {
          code: `const x = <div className={(s) => { for (const k of s.keys) { if (k) return 'is-loop' } return 'is-end' }} />`,
          languageOptions,
          errors: 2,
        },
      ],
    })
  })

  describe('a function that is not the whole value is not read', () => {
    ruleTester.run('class-channel', classChannelRule, {
      valid: [
        {
          // reached through a variable: still outside what rule 1 sees
          code: `const pick = (s) => (s.open ? 'is-open' : ''); const x = <div className={pick} />`,
          languageOptions,
        },
        {
          // in a conditional branch: not the whole value, so not read
          code: `const x = <div className={open ? (s) => 'is-a' : undefined} />`,
          languageOptions,
        },
        {
          // as a fallback: not the whole value, so not read
          code: `const x = <div className={props.className ?? ((s) => 'is-x')} />`,
          languageOptions,
        },
      ],
      invalid: [],
    })
  })
})
