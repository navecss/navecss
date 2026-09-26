/**
 * AC-consumer-constraints 11-16, 22-24: the default export's rules, exercised through
 * `stylelint.lint` against inline CSS, exactly as a consumer's project would resolve them.
 */
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import stylelint, { type Config, type LintResult } from 'stylelint'
import { describe, expect, it } from 'vitest'

import config, { OUTLINE_GUARD_CONSUMER_MESSAGE } from '../index.js'
import { cssPropertyNames, isMatchedByEntry } from './helpers/css-properties.ts'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const PACKAGE_DIR = path.resolve(HERE, '..')
const ROOT = path.resolve(HERE, '../../..')

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
  it('extending an SCSS-style config that nulls at-rule-no-unknown, then the package, keeps it off', async () => {
    // A real extends chain: stylelint-config-standard turns at-rule-no-unknown on, a config of
    // the kind an SCSS setup ships turns it off, then this package is extended last.
    const scratch = mkdtempSync(path.join(tmpdir(), 'nave-stylelint-config-scss-style-'))
    try {
      const scssStyle = path.join(scratch, 'scss-style.json')
      writeFileSync(scssStyle, '{ "rules": { "at-rule-no-unknown": null } }')
      const result = await stylelint.lint({
        code: '.card { @include mixin; @nave interactive; }',
        config: {
          extends: ['stylelint-config-standard', scssStyle, '@navecss/stylelint-config'],
        },
        configBasedir: ROOT,
      })
      expect(ruleIds(result.results[0]!.warnings)).not.toContain('at-rule-no-unknown')
    } finally {
      rmSync(scratch, { recursive: true, force: true })
    }
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

function strictValueReports(result: LintResult): LintResult['warnings'] {
  return result.warnings.filter((w) => w.rule === 'scale-unlimited/declaration-strict-value')
}

const checkedPropertyList = (
  config.rules?.['scale-unlimited/declaration-strict-value'] as unknown[]
)[0] as string[]

describe('AC-consumer-constraints-23 covers: R14, R11b', () => {
  it.each([
    'padding: 13px',
    'padding: 0 13px',
    'margin: 1px 2px 3px 4px',
    'background-color: red',
    'border: 1px solid red',
    'transition: opacity 200ms ease',
    'accent-color: red',
    'border-color: red',
    'border-top-color: red',
    'text-decoration-color: red',
  ])('%s produces exactly one strict-value report', async (declaration) => {
    const result = await lint(`.a { ${declaration}; }`)
    expect(strictValueReports(result)).toHaveLength(1)
  })

  it.each([
    'border-right-color: red',
    'border-bottom-color: red',
    'border-left-color: #fff',
    'border-top: 1px solid red',
    'border-bottom: 2px solid #000',
  ])('the border side colour %s produces exactly one strict-value report', async (declaration) => {
    const result = await lint(`.a { ${declaration}; }`)
    expect(strictValueReports(result)).toHaveLength(1)
  })

  it('.c { padding: 13px; margin: 7px; } produces one report per declaration', async () => {
    const result = await lint('.c { padding: 13px; margin: 7px; }')
    const reports = strictValueReports(result)
    expect(reports).toHaveLength(2)
    // Columns are 1-based; each report sits inside its own declaration's span.
    const marginColumn = '.c { padding: 13px; margin: 7px; }'.indexOf('margin') + 1
    const columns = reports.map((w) => w.column).toSorted((a, b) => a - b)
    expect(columns[0]).toBeLessThan(marginColumn)
    expect(columns[1]).toBeGreaterThanOrEqual(marginColumn)
  })

  // Over mdn-data's property list, never one derived from this package.
  const independentPropertyNames = cssPropertyNames()

  it('no CSS property name is matched by more than one entry of the shipped property list', () => {
    const overlapping = independentPropertyNames
      .map(
        (name) =>
          [name, checkedPropertyList.filter((entry) => isMatchedByEntry(entry, name))] as const,
      )
      .filter(([, entries]) => entries.length > 1)
    expect(overlapping).toEqual([])
  })

  it('every property named color or ending in -color, vendor-prefixed names excepted, is matched by exactly one entry', () => {
    const colourProperties = independentPropertyNames.filter(
      (name) => !name.startsWith('-') && (name === 'color' || name.endsWith('-color')),
    )
    expect(colourProperties).toContain('border-top-color')
    const notExactlyOne = colourProperties
      .map(
        (name) =>
          [
            name,
            checkedPropertyList.filter((entry) => isMatchedByEntry(entry, name)).length,
          ] as const,
      )
      .filter(([, count]) => count !== 1)
    expect(notExactlyOne).toEqual([])
  })

  it('font-size, font-weight, line-height, letter-spacing and font-family are each their own entry', () => {
    const properties = checkedPropertyList
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
    const manifest = JSON.parse(readFileSync(path.join(PACKAGE_DIR, 'package.json'), 'utf8')) as {
      exports: Record<string, string>
    }
    expect(Object.keys(manifest.exports).toSorted((a, b) => a.localeCompare(b))).toEqual([
      '.',
      './package.json',
    ])
  })

  it('names stylelint-config-standard in no dependency field', () => {
    const manifest = JSON.parse(
      readFileSync(path.join(PACKAGE_DIR, 'package.json'), 'utf8'),
    ) as Record<string, Record<string, string> | undefined>
    for (const field of [
      'dependencies',
      'devDependencies',
      'peerDependencies',
      'optionalDependencies',
    ]) {
      expect(Object.keys(manifest[field] ?? {}), `${field} names it`).not.toContain(
        'stylelint-config-standard',
      )
    }
  })

  it('the same rule, in a core src file linted with the root config, is reported by the four house rules', async () => {
    const rootConfig = JSON.parse(
      readFileSync(path.join(ROOT, '.stylelintrc.json'), 'utf8'),
    ) as Config
    const result = await stylelint.lint({
      code: '.Block__elem--mod { --brandColor: var(--x); color: var(--a); background-color: var(--b) !important; }',
      codeFilename: path.join(ROOT, 'packages/core/src/x.css'),
      config: rootConfig,
      configBasedir: ROOT,
    })
    const warnings = result.results[0]!.warnings
    const textOf = (rule: string): string => warnings.find((w) => w.rule === rule)?.text ?? ''
    // stylelint-config-standard sets three of these rules too, so each is identified as the
    // root's own by the message only the root config gives it.
    expect(textOf('selector-class-pattern')).toContain('nave-kebab-case')
    expect(textOf('custom-property-pattern')).toContain('must begin with --nave-')
    expect(textOf('declaration-no-important')).toContain('Avoid !important')
    expect(ruleIds(warnings)).toContain('order/properties-alphabetical-order')
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
