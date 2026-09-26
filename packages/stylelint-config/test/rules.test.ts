/**
 * AC-consumer-constraints 11-16, 22-24: the default export's rules, exercised through
 * `stylelint.lint` against inline CSS, exactly as a consumer's project would resolve them.
 */
import stylelint, { type LintResult } from 'stylelint'
import { describe, expect, it } from 'vitest'

import config, { OUTLINE_GUARD_CONSUMER_MESSAGE } from '../index.js'

async function lint(code: string, extraConfig: Record<string, unknown> = {}): Promise<LintResult> {
  const result = await stylelint.lint({
    code,
    config: { ...config, ...extraConfig },
  })
  return result.results[0]!
}

function ruleIds(warnings: { rule: string }[]): string[] {
  return warnings.map((w) => w.rule)
}

describe('AC-consumer-constraints-11 covers: R11, R11a', () => {
  it('.card { @nave interactive focusRing; } is not reported', async () => {
    const result = await lint('.card { @nave interactive focusRing; }')
    expect(result.warnings).toEqual([])
  })

  it('@nvae is reported by at-rule-no-unknown naming @nvae', async () => {
    const result = await lint('.card { @nvae interactive; }', {
      rules: { ...config.rules, 'at-rule-no-unknown': true },
    })
    const warning = result.warnings.find((w) => w.rule === 'at-rule-no-unknown')
    expect(warning?.text).toContain('@nvae')
  })

  it('@nave 12px is reported by at-rule-prelude-no-invalid', async () => {
    const result = await lint('.card { @nave 12px; }', {
      rules: { ...config.rules, 'at-rule-prelude-no-invalid': true },
    })
    expect(ruleIds(result.warnings)).toContain('at-rule-prelude-no-invalid')
  })

  it('has no at-rule-no-unknown key and declares nave under languageOptions.syntax.atRules', () => {
    expect(config.rules).not.toHaveProperty('at-rule-no-unknown')
    expect(config.languageOptions?.syntax?.atRules).toHaveProperty('nave')
  })
})

describe('AC-consumer-constraints-12 covers: R11a', () => {
  it('a consumer at-rule-no-unknown ignoring tailwind still reports @nvae and admits @tailwind/@nave', async () => {
    const result = await lint(
      '@tailwind base;\n.card { @nave interactive; }\n.x { @nvae interactive; }',
      {
        rules: {
          ...config.rules,
          'at-rule-no-unknown': [true, { ignoreAtRules: ['tailwind'] }],
        },
      },
    )
    const unknownAtRule = result.warnings.filter((w) => w.rule === 'at-rule-no-unknown')
    expect(unknownAtRule).toHaveLength(1)
    expect(unknownAtRule[0]?.text).toContain('@nvae')
  })
})

describe('AC-consumer-constraints-13 covers: R11a', () => {
  it('an SCSS-style config nulling at-rule-no-unknown keeps it off after extending the package', async () => {
    const result = await lint('.card { @include mixin; @nave interactive; }', {
      rules: { ...config.rules, 'at-rule-no-unknown': undefined },
    })
    expect(ruleIds(result.warnings)).not.toContain('at-rule-no-unknown')
  })
})

describe('AC-consumer-constraints-22 covers: R13', () => {
  it('report text interpolates the failing value and property once each', async () => {
    const a = await lint('.a { padding: 13px; }')
    const b = await lint('.b { margin: 7px; }')
    const c = await lint('.c { padding: 0 13px; }')
    expect(a.warnings[0]?.text).toContain('13px')
    expect(a.warnings[0]?.text).toContain('padding')
    expect(b.warnings[0]?.text).toContain('7px')
    expect(b.warnings[0]?.text).toContain('margin')
    expect(c.warnings[0]?.text).toContain('13px')
    expect(c.warnings[0]?.text).toContain('padding')
  })

  it('the strict-value message interpolates ${value}/${property} exactly once each', () => {
    const options = (
      config.rules?.['scale-unlimited/declaration-strict-value'] as unknown[]
    )[1] as {
      message: string
    }
    const valueOccurrences = options.message.split('${value}').length - 1
    const propertyOccurrences = options.message.split('${property}').length - 1
    expect(valueOccurrences).toBe(1)
    expect(propertyOccurrences).toBe(1)
  })

  it('no report contains %s, ${, undefined, [object, or "design token"', async () => {
    const result = await lint('.a { padding: 13px; }')
    const text = result.warnings[0]!.text
    expect(text).not.toContain('%s')
    expect(text).not.toContain('${')
    expect(text).not.toContain('undefined')
    expect(text).not.toContain('[object')
    expect(text.toLowerCase()).not.toContain('design token')
  })

  it('no custom message names a repository path', () => {
    const messages = [
      (config.rules?.['scale-unlimited/declaration-strict-value'] as unknown[])[1] as {
        message: string
      },
      (config.rules?.['declaration-property-value-disallowed-list'] as unknown[])[1] as {
        message: string
      },
    ].map((options) => options.message)
    for (const message of messages) {
      expect(message).not.toMatch(/packages\/|src\/|dist\/|\.test\./)
      expect(message).not.toMatch(/\.(ts|mjs|js|css|json)\b/)
    }
  })
})

describe('AC-consumer-constraints-23 covers: R14', () => {
  it.each([
    ['padding: 13px', 1],
    ['padding: 0 13px', 1],
    ['margin: 1px 2px 3px 4px', 4],
    ['background-color: red', 1],
    ['border: 1px solid red', 1],
    ['transition: opacity 200ms ease', 1],
    ['accent-color: red', 1],
  ])('%s produces exactly one strict-value report', async (declaration, _longhands) => {
    const result = await lint(`.a { ${declaration}; }`)
    const strictValueWarnings = result.warnings.filter(
      (w) => w.rule === 'scale-unlimited/declaration-strict-value',
    )
    expect(strictValueWarnings).toHaveLength(1)
  })

  it('.c { padding: 13px; margin: 7px; } produces one report per declaration', async () => {
    const result = await lint('.c { padding: 13px; margin: 7px; }')
    const strictValueWarnings = result.warnings.filter(
      (w) => w.rule === 'scale-unlimited/declaration-strict-value',
    )
    expect(strictValueWarnings).toHaveLength(2)
  })

  it('font-size, font-weight, line-height, letter-spacing and font-family are each their own entry', () => {
    const properties = (
      config.rules?.['scale-unlimited/declaration-strict-value'] as unknown[]
    )[0] as string[]
    for (const name of [
      'font-size',
      'font-weight',
      'line-height',
      'letter-spacing',
      'font-family',
    ]) {
      const matches = properties.filter((entry) => entry === name)
      expect(matches).toHaveLength(1)
    }
  })
})

describe('AC-consumer-constraints-24 covers: R15, R11, R12', () => {
  it('rule ids are exactly scale-unlimited/declaration-strict-value and declaration-property-value-disallowed-list', async () => {
    const resolved = await stylelint.resolveConfig(process.cwd(), { config })
    expect(Object.keys(resolved?.rules ?? {}).toSorted((a, b) => a.localeCompare(b))).toEqual(
      [
        'declaration-property-value-disallowed-list',
        'scale-unlimited/declaration-strict-value',
      ].toSorted((a, b) => a.localeCompare(b)),
    )
  })

  it('a BEM class with an unregistered custom property and !important produces no report', async () => {
    const result = await lint(
      '.Block__elem--mod { --brandColor: var(--x); color: var(--a); background-color: var(--b) !important; }',
    )
    expect(result.warnings).toEqual([])
  })

  it('has only the root export (plus package.json) and no extends', () => {
    expect(config).not.toHaveProperty('extends')
  })

  it('house rules are absent from the default export', async () => {
    const result = await lint('.Block__elem--mod { color: red !important; }', {
      rules: {
        ...config.rules,
        'selector-class-pattern': '^[a-z]+$',
        'custom-property-pattern': '^nave-',
        'order/properties-alphabetical-order': true,
        'declaration-no-important': true,
      },
    })
    expect(ruleIds(result.warnings)).toEqual(
      expect.arrayContaining(['selector-class-pattern', 'declaration-no-important']),
    )
  })
})

describe('outline guard message is transcribed byte-exact', () => {
  it('is 444 bytes with sha256 prefix 6fa2f3c5590d13b4', async () => {
    const { createHash } = await import('node:crypto')
    const bytes = Buffer.byteLength(OUTLINE_GUARD_CONSUMER_MESSAGE, 'utf8')
    expect(bytes).toBe(444)
    const hash = createHash('sha256').update(OUTLINE_GUARD_CONSUMER_MESSAGE).digest('hex')
    expect(hash.slice(0, 16)).toBe('6fa2f3c5590d13b4')
  })
})
