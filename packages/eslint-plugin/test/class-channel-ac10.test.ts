/**
 * AC-eslint-plugin-10 covers: R5, R6.
 */
import { RuleTester } from 'eslint'
import { mkdirSync, mkdtempSync, realpathSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterAll, beforeAll, describe, it } from 'vitest'

import { classChannelRule } from '../src/rules/class-channel.ts'
import { countEscapesRule } from '../src/rules/count-escapes.ts'
import { rawReasonRule } from '../src/rules/raw-reason.ts'

const languageOptions = {
  ecmaVersion: 2024 as const,
  sourceType: 'module' as const,
  parserOptions: { ecmaFeatures: { jsx: true } },
}

const ruleTester = new RuleTester()

describe('AC-10: cxModules and cx.raw recognition', () => {
  it('non-Nave cx bindings never pass as an atom call', () => {
    ruleTester.run('class-channel', classChannelRule, {
      valid: [],
      invalid: [
        {
          code: `import cx from 'classnames'\nconst el = <div className={cx('legacy-card')} />`,
          languageOptions,
          errors: 1,
        },
        {
          code: `import { cx } from '@emotion/css'\nconst el = <div className={cx('legacy-card')} />`,
          languageOptions,
          errors: 1,
        },
      ],
    })
  })

  it('an aliased Nave import is still recognised', () => {
    ruleTester.run('class-channel', classChannelRule, {
      valid: [
        {
          code: `import { cx as n } from '@navecss/core/cx'\nconst el = <div className={n('flex')} />`,
          languageOptions,
        },
      ],
      invalid: [
        {
          code: `import { cx as n } from '@navecss/core/cx'\nconst el = <div className={n('legacy-card')} />`,
          languageOptions,
          errors: 1,
        },
      ],
    })
  })

  it('cx.raw is recognised however it is reached, one hop, and passes rule 1', () => {
    ruleTester.run('class-channel', classChannelRule, {
      valid: [
        {
          code: `import { cx } from '@navecss/core/cx'\nconst el = <div className={cx['raw']('legacy-card')} />`,
          languageOptions,
        },
        {
          code: `import { cx } from '@navecss/core/cx'\nconst { raw } = cx\nconst el = <div className={raw('legacy-card')} />`,
          languageOptions,
        },
        {
          code: `import { cx } from '@navecss/core/cx'\nconst { raw: esc } = cx\nconst el = <div className={esc('legacy-card')} />`,
          languageOptions,
        },
        {
          code: `import { cx } from '@navecss/core/cx'\nconst r = cx.raw\nconst el = <div className={r('legacy-card')} />`,
          languageOptions,
        },
        {
          // A second hop is not recognised as cx.raw, so `r2('legacy-card')` is an unrecognised
          // call to rule 1 (an opaque call, not cx/cx.raw/a helper): it passes, same as any
          // other unknown function call (getClass()).
          code: `import { cx } from '@navecss/core/cx'\nconst r = cx.raw\nconst r2 = r\nconst el = <div className={r2('legacy-card')} />`,
          languageOptions,
        },
      ],
      invalid: [],
    })
  })

  it("a local binding that shadows the Nave import is not Nave's cx: a parameter, a destructured parameter, an inner declaration", () => {
    const prelude = `import { cx } from '@navecss/core/cx'\nimport { cn } from './cn'\n`
    const settings = { '@navecss': { allow: ['app-'] } }
    ruleTester.run('class-channel', classChannelRule, {
      valid: [
        {
          code: `${prelude}const F = ({ cx }) => <div className={cx('app-card')} />`,
          languageOptions,
          settings,
        },
        {
          code: `${prelude}function F() { const cx = cn; return <div className={cx('app-card')} /> }`,
          languageOptions,
          settings,
        },
        {
          code: `${prelude}function F(cx) { return <div className={cx('app-card')} /> }`,
          languageOptions,
          settings,
        },
      ],
      invalid: [
        {
          code: `${prelude}const F = ({ cx }) => <div className={cx('flex')} />`,
          languageOptions,
          settings,
          errors: [{ message: /^"flex" is not a CSS Module class/ }],
        },
      ],
    })
    for (const rule of [rawReasonRule, countEscapesRule]) {
      ruleTester.run('raw', rule, {
        valid: [
          { code: `${prelude}function F(cx) { return cx.raw('legacy-card') }`, languageOptions },
          {
            code: `${prelude}function F({ cx }) { return cx.raw('legacy-card') }`,
            languageOptions,
          },
        ],
        invalid: [],
      })
    }
  })

  it('a namespace import reaches cx and cx.raw; an optional call and a template-literal key are recognised', () => {
    const ns = `import * as c from '@navecss/core/cx'\n`
    const named = `import { cx } from '@navecss/core/cx'\n`
    ruleTester.run('class-channel', classChannelRule, {
      valid: [
        { code: `${ns}const el = <div className={c.cx('flex')} />`, languageOptions },
        { code: `${ns}const el = <div className={c.cx.raw('legacy-card')} />`, languageOptions },
        { code: `${named}const el = <div className={cx?.('flex')} />`, languageOptions },
        {
          code: `${named}const el = <div className={cx[\`raw\`]('legacy-card')} />`,
          languageOptions,
        },
      ],
      invalid: [
        {
          code: `${ns}const el = <div className={c.cx('legacy-card')} />`,
          languageOptions,
          errors: [{ message: /^c\.cx\("legacy-card"\) is not a Nave atom/ }],
        },
        {
          code: `${named}const el = <div className={cx?.('legacy-card')} />`,
          languageOptions,
          errors: 1,
        },
      ],
    })
    for (const rule of [rawReasonRule, countEscapesRule]) {
      ruleTester.run('raw', rule, {
        valid: [],
        invalid: [
          { code: `${ns}const k = c.cx.raw('legacy-card')`, languageOptions, errors: 1 },
          { code: `${named}const k = cx[\`raw\`]('legacy-card')`, languageOptions, errors: 1 },
        ],
      })
    }
  })

  it("only a const is followed one hop to cx.raw, and a default import is not Nave's cx", () => {
    const named = `import { cx } from '@navecss/core/cx'\n`
    for (const rule of [rawReasonRule, countEscapesRule]) {
      ruleTester.run('raw', rule, {
        valid: [
          { code: `${named}let r = cx.raw\nconst k = r('legacy-card')`, languageOptions },
          { code: `${named}let { raw } = cx\nconst k = raw('legacy-card')`, languageOptions },
          {
            code: `import cx from '@navecss/core/cx'\nconst k = cx.raw('legacy-card')`,
            languageOptions,
          },
        ],
        invalid: [
          {
            code: `${named}const r = cx.raw\nconst k = r('legacy-card')`,
            languageOptions,
            errors: 1,
          },
        ],
      })
    }
    ruleTester.run('class-channel', classChannelRule, {
      valid: [],
      invalid: [
        {
          // Core exports no default, so this `cx` is a helper and its literal is a class.
          code: `import cx from '@navecss/core/cx'\nconst el = <div className={cx('flex')} />`,
          languageOptions,
          errors: [{ message: /^"flex" is not a CSS Module class/ }],
        },
      ],
    })
  })

  describe('cxModules resolution (relative wrapper files)', () => {
    let root: string
    const cxModulesSettings = {
      '@navecss': { cxModules: ['./src/ui/cx.js'], allow: ['app-'] },
    }

    beforeAll(() => {
      const scratch = mkdtempSync(path.join(tmpdir(), 'nave-eslint-plugin-'))
      root = realpathSync(scratch)
      mkdirSync(path.join(root, 'src/ui'), { recursive: true })
      mkdirSync(path.join(root, 'src/a'), { recursive: true })
      mkdirSync(path.join(root, 'src/b/c'), { recursive: true })
      mkdirSync(path.join(root, 'src/ts'), { recursive: true })
      writeFileSync(path.join(root, 'src/ui/cx.js'), "export { cx } from '@navecss/core/cx'\n")
      writeFileSync(path.join(root, 'src/a/cx.js'), "export const cx = () => ''\n")
      writeFileSync(path.join(root, 'src/ts/cx.ts'), "export { cx } from '@navecss/core/cx'\n")
    })

    afterAll(() => {
      process.chdir(path.resolve(import.meta.dirname, '..'))
    })

    function inRoot(run: () => void): void {
      const cwdBefore = process.cwd()
      process.chdir(root)
      try {
        run()
      } finally {
        process.chdir(cwdBefore)
      }
    }

    it("a relative wrapper import resolving to the entry is Nave's cx: an atom passes, a declared class does not (from two depths)", () => {
      inRoot(() => {
        ruleTester.run('class-channel', classChannelRule, {
          valid: [
            {
              code: `import { cx } from '../ui/cx.js'\nconst x = <div className={cx('flex')} />`,
              languageOptions,
              settings: cxModulesSettings,
              filename: path.join(root, 'src/a/x.jsx'),
            },
            {
              code: `import { cx } from '../../ui/cx.js'\nconst x = <div className={cx('flex')} />`,
              languageOptions,
              settings: cxModulesSettings,
              filename: path.join(root, 'src/b/c/y.jsx'),
            },
          ],
          invalid: [
            {
              code: `import { cx } from '../ui/cx.js'\nconst x = <div className={cx('app-card')} />`,
              languageOptions,
              settings: cxModulesSettings,
              filename: path.join(root, 'src/a/x.jsx'),
              errors: [{ message: /^cx\("app-card"\) is not a Nave atom/ }],
            },
          ],
        })
      })
    })

    it("a local ./cx.js that is not the entry is not Nave's: its cx is a helper", () => {
      inRoot(() => {
        ruleTester.run('class-channel', classChannelRule, {
          valid: [
            {
              code: `import { cx } from './cx.js'\nconst x = <div className={cx('app-card')} />`,
              languageOptions,
              settings: cxModulesSettings,
              filename: path.join(root, 'src/a/x.jsx'),
            },
          ],
          invalid: [
            {
              code: `import { cx } from './cx.js'\nconst x = <div className={cx('flex')} />`,
              languageOptions,
              settings: cxModulesSettings,
              filename: path.join(root, 'src/a/x.jsx'),
              errors: [{ message: /^"flex" is not a CSS Module class/ }],
            },
          ],
        })
      })
    })

    it('the entry is resolved from the working directory: from elsewhere the wrapper is not recognised', () => {
      ruleTester.run('class-channel', classChannelRule, {
        valid: [],
        invalid: [
          {
            code: `import { cx } from '../ui/cx.js'\nconst x = <div className={cx('flex')} />`,
            languageOptions,
            settings: cxModulesSettings,
            filename: path.join(root, 'src/a/x.jsx'),
            errors: [{ message: /^"flex" is not a CSS Module class/ }],
          },
        ],
      })
    })

    it('a TypeScript wrapper imported with a NodeNext ".js" specifier matches its ".ts" entry', () => {
      inRoot(() => {
        ruleTester.run('class-channel', classChannelRule, {
          valid: [
            {
              code: `import { cx } from '../ts/cx.js'\nconst x = <div className={cx('flex')} />`,
              languageOptions,
              settings: { '@navecss': { cxModules: ['./src/ts/cx.ts'] } },
              filename: path.join(root, 'src/a/x.jsx'),
            },
          ],
          invalid: [],
        })
      })
    })
  })
})
