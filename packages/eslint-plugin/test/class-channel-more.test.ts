/**
 * AC-eslint-plugin-08, -11, -12, -13, -14 cover: R4, R5, R5a, R6, R7.
 */
import { RuleTester } from 'eslint'
import { describe, it } from 'vitest'

import { classChannelRule } from '../src/rules/class-channel.ts'

const languageOptions = {
  ecmaVersion: 2024 as const,
  sourceType: 'module' as const,
  parserOptions: { ecmaFeatures: { jsx: true } },
}

/**
Runs one AC-12 allow-entry case through the class-channel rule.
 */
function runAllowCase(allow: unknown, code: string, errors: number): void {
  ruleTester.run('class-channel', classChannelRule, {
    valid: errors === 0 ? [{ code, languageOptions, settings: { '@navecss': { allow } } }] : [],
    invalid:
      errors === 0 ? [] : [{ code, languageOptions, settings: { '@navecss': { allow } }, errors }],
  })
}

const ruleTester = new RuleTester()

describe('AC-08: declared entries, nave- output', () => {
  const settings = { '@navecss': { allow: ['app-', '/^u-/u'] } }

  it('legacy-card and other are each reported once, app-card passes', () => {
    ruleTester.run('class-channel', classChannelRule, {
      valid: [],
      invalid: [
        {
          code: `const el = <div className="app-card legacy-card other" />`,
          languageOptions,
          settings,
          errors: 2,
        },
      ],
    })
  })

  it('nave-flex is reported naming the atom flex', () => {
    ruleTester.run('class-channel', classChannelRule, {
      valid: [],
      invalid: [
        {
          code: `const el = <div className="nave-flex" />`,
          languageOptions,
          settings,
          errors: [{ message: /flex/ }],
        },
      ],
    })
  })

  it('nave-banana-split is reported saying no atom emits it', () => {
    ruleTester.run('class-channel', classChannelRule, {
      valid: [],
      invalid: [
        {
          code: `const el = <div className="nave-banana-split" />`,
          languageOptions,
          settings,
          errors: [{ message: /no Nave atom emits/ }],
        },
      ],
    })
  })
})

describe('AC-11 (R5a): logical-AND directly as a slot or whole value', () => {
  const PRELUDE = `import { cx } from '@navecss/core/cx'`

  it('reports the whole-value shape and the slot shape, distinctly', () => {
    ruleTester.run('class-channel', classChannelRule, {
      valid: [
        { code: "const el = <div className={`${cond ? styles.x : ''}`} />", languageOptions },
        { code: 'const el = <div className={cond ? styles.x : undefined} />', languageOptions },
        {
          code: `${PRELUDE}\nconst el = <div className={cx.raw(cond && styles.x)} />`,
          languageOptions,
        },
        {
          code: `${PRELUDE}\nconst el = <div className={\`\${cx.raw(cond && styles.x)}\`} />`,
          languageOptions,
        },
      ],
      invalid: [
        {
          code: 'const el = <div className={`${cond && styles.x}`} />',
          languageOptions,
          errors: [{ message: /interpolated into the class list/ }],
        },
        {
          code: 'const el = <div className={cond && styles.x} />',
          languageOptions,
          errors: [{ message: /becomes the whole className/ }],
        },
        {
          code: `${PRELUDE}\nconst el = <div className={\`\${cx('flex')} \${on && styles.x}\`} />`,
          languageOptions,
          errors: [{ message: /interpolated into the class list/ }],
        },
      ],
    })
  })
})

describe('AC-12 (R6): allow entry compilation', () => {
  it('unset/[] reports; prefix admits by startsWith, case-sensitive', () => {
    runAllowCase(undefined, `const el = <div className="app-shell" />`, 1)
    runAllowCase(['app-'], `const el = <div className="app-shell" />`, 0)
    runAllowCase(['app-'], `const el = <div className="myapp-shell" />`, 1)
    runAllowCase(['app-'], `const el = <div className="App-shell" />`, 1)
  })

  it('pattern entries use search semantics, never anchored automatically', () => {
    runAllowCase(['/^[a-z]+__[a-z-]+$/u'], `const el = <div className="card__title" />`, 0)
    runAllowCase(['/^[a-z]+__[a-z-]+$/u'], `const el = <div className="card" />`, 1)
    runAllowCase(['/card/'], `const el = <div className="legacy-card" />`, 0)
    runAllowCase(['/^APP-/i'], `const el = <div className="app-shell" />`, 0)
  })

  it('truncated template pieces are admitted by a prefix only', () => {
    runAllowCase(['card--'], 'const el = <div className={`card--${size}`} />', 0)
    runAllowCase(['/^[a-z]+(--[a-z]+)?$/u'], 'const el = <div className={`card--${size}`} />', 1)
  })

  it.each([['/^app-/g'], ['/^app-/y'], ['/[/'], ['//'], ['/^app-/q'], ['/^[a-z-]+$/v'], ['']])(
    'entry %j fails the run as a configuration error',
    (allow) => {
      let isThrew = false
      try {
        ruleTester.run('class-channel', classChannelRule, {
          valid: [
            {
              code: 'const el = <div className="app-shell" />',
              languageOptions,
              settings: { '@navecss': { allow } },
            },
          ],
          invalid: [],
        })
      } catch {
        isThrew = true
      }
      if (!isThrew)
        throw new Error(`expected a configuration error for allow entry ${JSON.stringify(allow)}`)
    },
  )
})

describe('AC-13 (R7): helper calls checked through their arguments', () => {
  const PRELUDE = `
    import clsx from 'clsx'
    import classnames from 'classnames'
    import { cn } from '@/lib/utils'
    import cx from 'classnames'
  `

  it('composition through a helper passes; a literal inside one is reported', () => {
    ruleTester.run('class-channel', classChannelRule, {
      valid: [
        {
          code: `${PRELUDE}\nconst el = <div className={clsx(styles.root, on && styles.on)} />`,
          languageOptions,
        },
        { code: `${PRELUDE}\nconst el = <div className={cn(styles.root)} />`, languageOptions },
        {
          code: `${PRELUDE}\nconst el = <div className={clsx('app-shell')} />`,
          languageOptions,
          settings: { '@navecss': { allow: ['app-'] } },
        },
      ],
      invalid: [
        {
          code: `${PRELUDE}\nconst el = <div className={clsx('legacy-card', styles.root)} />`,
          languageOptions,
          errors: 1,
        },
        {
          code: `${PRELUDE}\nconst el = <div className={classnames('legacy-card')} />`,
          languageOptions,
          errors: 1,
        },
        {
          code: `${PRELUDE}\nconst el = <div className={cx('legacy-card')} />`,
          languageOptions,
          errors: 1,
        },
        {
          code: `${PRELUDE}\nconst el = <div className={cn(styles.root, { [styles.on]: on, 'is-open': open })} />`,
          languageOptions,
          errors: 1,
        },
        {
          code: `${PRELUDE}\nconst el = <div className={clsx(['a', styles.b])} />`,
          languageOptions,
          errors: 1,
        },
        {
          code: `${PRELUDE}\nconst el = <div className={clsx(on ? 'x' : styles.y)} />`,
          languageOptions,
          errors: 1,
        },
        {
          code: `${PRELUDE}\nconst el = <div className={clsx({ is: open }, 'app-card')} />`,
          languageOptions,
          settings: { '@navecss': { allow: ['app-'] } },
          errors: 1,
        },
      ],
    })
  })

  it('a call not in the helpers list passes until configured', () => {
    ruleTester.run('class-channel', classChannelRule, {
      valid: [
        {
          code: `${PRELUDE}\nconst el = <div className={myJoin('legacy-card')} />`,
          languageOptions,
        },
      ],
      invalid: [
        {
          code: `${PRELUDE}\nconst el = <div className={myJoin('legacy-card')} />`,
          languageOptions,
          settings: { '@navecss': { helpers: ['myJoin'] } },
          errors: 1,
        },
      ],
    })
  })
})

describe('AC-14 (R5): cx() atom check', () => {
  const PRELUDE = `import { cx } from '@navecss/core/cx'`

  it('an atom passes; an unknown string is reported', () => {
    ruleTester.run('class-channel', classChannelRule, {
      valid: [
        { code: `${PRELUDE}\nconst el = <div className={cx('flex')} />`, languageOptions },
        { code: `${PRELUDE}\nconst el = <div className={cx('focusRing')} />`, languageOptions },
        {
          code: `${PRELUDE}\nconst el = <div className={cx('interactive', isActive && 'focusRing')} />`,
          languageOptions,
        },
        { code: `${PRELUDE}\nconst el = <div className={cx(name)} />`, languageOptions },
      ],
      invalid: [
        {
          code: `${PRELUDE}\nconst el = <div className={cx('legacy-card')} />`,
          languageOptions,
          errors: 1,
        },
        {
          code: `${PRELUDE}\nconst el = <div className={cx('card')} />`,
          languageOptions,
          errors: 1,
        },
        {
          code: `${PRELUDE}\nconst el = <div className={cx('app-card')} />`,
          languageOptions,
          settings: { '@navecss': { allow: ['app-'] } },
          errors: 1,
        },
        {
          code: `${PRELUDE}\nconst el = <div className={cx('flex', 'legacy-card')} />`,
          languageOptions,
          errors: 1,
        },
        {
          code: `${PRELUDE}\nconst el = <div className={cx('toString')} />`,
          languageOptions,
          errors: 1,
        },
        {
          code: `${PRELUDE}\nconst el = <div className={cx('constructor')} />`,
          languageOptions,
          errors: 1,
        },
      ],
    })
  })
})
