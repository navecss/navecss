/**
 * AC-eslint-plugin-08, -11, -12, -13, -14 cover: R4, R5, R5a, R6, R7.
 */
import { Linter, RuleTester } from 'eslint'
import { describe, expect, it } from 'vitest'

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
          errors: [{ message: /Write the atom instead: @nave flex or cx\('flex'\)\.$/ }],
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
    // A pattern that does match the cut text itself still does not admit it: only a prefix can.
    runAllowCase(['/^card--/u'], 'const el = <div className={`card--${size}`} />', 1)
  })

  it.each(['/^app-/g', '/^app-/y', '/[/', '//', '/^app-/q', '/^[a-z-]+$/v', ''])(
    'entry %j, inside the allow array, fails the run as a configuration error naming it',
    (entry) => {
      const run = (): void => {
        ruleTester.run('class-channel', classChannelRule, {
          valid: [
            {
              code: 'const el = <div className="app-shell" />',
              languageOptions,
              settings: { '@navecss': { allow: [entry] } },
            },
          ],
          invalid: [],
        })
      }
      expect(run).toThrow(`"allow" entry ${JSON.stringify(entry)}`)
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

describe('AC-14 (R5): a cx() argument is one class name, read whole', () => {
  const PRELUDE = `import { cx } from '@navecss/core/cx'\nimport { cx as ncx } from '@navecss/core/cx'`

  it('two atom names in one string, or static text beside a slot, is not an atom', () => {
    ruleTester.run('class-channel', classChannelRule, {
      valid: [
        { code: `${PRELUDE}\nconst el = <div className={cx(\`flex\`)} />`, languageOptions },
        { code: `${PRELUDE}\nconst el = <div className={cx(\`\${name}\`)} />`, languageOptions },
      ],
      invalid: [
        {
          code: `${PRELUDE}\nconst el = <div className={cx('flex block')} />`,
          languageOptions,
          errors: [{ message: /^cx\("flex block"\) is not a Nave atom/ }],
        },
        {
          code: `${PRELUDE}\nconst el = <div className={cx(\`flex \${n}\`)} />`,
          languageOptions,
          errors: [{ message: /^cx\(`flex \$\{n\}`\) is not a Nave atom/ }],
        },
      ],
    })
  })

  it('prints the callee as the file names it, and a nave- string names its atom', () => {
    ruleTester.run('class-channel', classChannelRule, {
      valid: [],
      invalid: [
        {
          code: `${PRELUDE}\nconst el = <div className={ncx('legacy-card')} />`,
          languageOptions,
          errors: [
            {
              message:
                'ncx("legacy-card") is not a Nave atom: a string passed to ncx() must name one. Prefer, in order: a CSS Module class (styles.x), a Nave atom through cx(), a class the project declares as its own (declared: none), and only then cx.raw() with a reason.',
            },
          ],
        },
        {
          code: `${PRELUDE}\nconst el = <div className={cx('nave-flex')} />`,
          languageOptions,
          errors: [
            {
              message:
                "\"nave-flex\" is a class Nave's own build outputs, not one you write: it is not seen as input. Write the atom instead: @nave flex or cx('flex').",
            },
          ],
        },
      ],
    })
  })
})

describe('AC-13 (R7): a helper call inside Nave cx() is read through its arguments', () => {
  const PRELUDE = `import clsx from 'clsx'\nimport { cx } from '@navecss/core/cx'`

  it('cx(clsx(literal)) reports the literal as a class, never under the atom check', () => {
    ruleTester.run('class-channel', classChannelRule, {
      valid: [
        {
          code: `${PRELUDE}\nconst el = <div className={cx(clsx(styles.a, on && styles.b))} />`,
          languageOptions,
        },
      ],
      invalid: [
        {
          code: `${PRELUDE}\nconst el = <div className={cx(clsx('legacy-card'))} />`,
          languageOptions,
          errors: [{ message: /^"legacy-card" is not a CSS Module class/ }],
        },
        {
          code: `${PRELUDE}\nconst el = <div className={cx(clsx('flex'))} />`,
          languageOptions,
          errors: [{ message: /^"flex" is not a CSS Module class.*cx\('flex'\)/ }],
        },
      ],
    })
  })
})

describe('AC-09 (R5, R5a): a template anywhere in the value has its slots read', () => {
  const PRELUDE = `import clsx from 'clsx'\nimport { cx } from '@navecss/core/cx'`

  it('a template in a conditional branch, in a slot, or in a helper argument', () => {
    ruleTester.run('class-channel', classChannelRule, {
      valid: [],
      invalid: [
        {
          code: `${PRELUDE}\nconst el = <div className={on ? \`\${cx('legacy-card')}\` : ''} />`,
          languageOptions,
          errors: [{ message: /^cx\("legacy-card"\) is not a Nave atom/ }],
        },
        {
          code: `${PRELUDE}\nconst el = <div className={on ? \`\${a && s.x}\` : ''} />`,
          languageOptions,
          errors: [{ message: /interpolated into the class list/ }],
        },
        {
          code: `${PRELUDE}\nconst el = <div className={clsx(\`a \${'legacy-card'}\`)} />`,
          languageOptions,
          errors: [{ message: /^"a" is not/ }, { message: /^"legacy-card" is not/ }],
        },
      ],
    })
  })
})

describe('one report per offending class', () => {
  it('the same const reached through both branches is reported once', () => {
    ruleTester.run('class-channel', classChannelRule, {
      valid: [],
      invalid: [
        {
          code: `const L = 'legacy-card'\nconst el = <div className={on ? L : L} />`,
          languageOptions,
          errors: 1,
        },
      ],
    })
  })
})

describe('AC-12 (R6): settings that are not the declared shape are configuration errors', () => {
  const linter = new Linter()

  function lintWith(navecss: unknown): () => void {
    return () =>
      linter.verify('const el = <div className="app-shell" />', {
        languageOptions,
        plugins: { '@navecss': { rules: { 'class-channel': classChannelRule } } },
        rules: { '@navecss/class-channel': 'error' },
        settings: { '@navecss': navecss },
      })
  }

  // A settings value is JSON, so `null` is a value a consumer's config can really hold.
  const JSON_NULL: unknown = JSON.parse('null')

  it.each([
    ['allow', 42, '42'],
    ['allow', JSON_NULL, 'null'],
    ['allow', /^app-/u, '/^app-/u'],
    ['cxModules', JSON_NULL, 'null'],
    ['helpers', 1, '1'],
  ])(
    'a non-string %s entry (%s) names the key and the entry, never a raw TypeError',
    (key, entry, shown) => {
      const run = lintWith({ [key]: [entry] })
      expect(run).toThrow(`"${key}" entry ${shown}`)
      expect(run).not.toThrow(TypeError)
    },
  )

  it.each([
    ['a string', 'app-'],
    ['an array', ['app-']],
    ['a number', 42],
  ])("settings['@navecss'] that is %s is a configuration error", (_label, value) => {
    const run = lintWith(value)
    expect(run).toThrow(/settings\['@navecss'\] must be an object/)
    expect(run).not.toThrow(TypeError)
  })

  it('an unknown key is ignored: the settings namespace is shared', () => {
    expect(lintWith({ allow: ['app-'], allowed: ['x'] })).not.toThrow()
  })
})
