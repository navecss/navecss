import { RuleTester } from 'eslint'
/**
 * AC-eslint-plugin-10 covers: R5, R6.
 */
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterAll, beforeAll, describe, it } from 'vitest'

import { classChannelRule } from '../src/rules/class-channel.ts'

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

  describe('cxModules resolution (relative wrapper files)', () => {
    let root: string

    beforeAll(() => {
      root = mkdtempSync(path.join(tmpdir(), 'nave-eslint-plugin-'))
      mkdirSync(path.join(root, 'src/ui'), { recursive: true })
      mkdirSync(path.join(root, 'src/a'), { recursive: true })
      mkdirSync(path.join(root, 'src/b/c'), { recursive: true })
      writeFileSync(path.join(root, 'src/ui/cx.js'), "export { cx } from '@navecss/core/cx'\n")
    })

    afterAll(() => {
      process.chdir(path.resolve(import.meta.dirname, '..'))
    })

    it('recognises a relative wrapper import resolving to the declared cxModules entry', () => {
      const cwdBefore = process.cwd()
      process.chdir(root)
      try {
        ruleTester.run('class-channel', classChannelRule, {
          valid: [],
          invalid: [
            {
              code: `import { cx } from '../ui/cx.js'\nconst el = <div className={cx('legacy-card')} />`,
              languageOptions,
              settings: { '@navecss': { cxModules: ['./src/ui/cx.js'] } },
              filename: path.join(root, 'src/a/x.jsx'),
              errors: 1,
            },
            {
              code: `import { cx } from '../../ui/cx.js'\nconst el = <div className={cx('legacy-card')} />`,
              languageOptions,
              settings: { '@navecss': { cxModules: ['./src/ui/cx.js'] } },
              filename: path.join(root, 'src/b/c/y.jsx'),
              errors: 1,
            },
          ],
        })
      } finally {
        process.chdir(cwdBefore)
      }
    })
  })
})
