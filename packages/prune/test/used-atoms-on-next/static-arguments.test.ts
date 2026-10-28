/**
 * AC-nextjs-used-atoms-17 for AC-used-atoms-05 (other references to the binding), -10 (arguments
 * that cannot be read) and -11 (a literal that is no atom) on the plugin run over core's own
 * `atomic.css`. A failing row is a problem in the record, and the build's check turns the record
 * into the report `next build` prints; the report is built here from the record.
 */
import { atoms as builtInAtoms } from '@navecss/core/atoms'
import { describe, expect, it } from 'vitest'

import { registerIsolation } from '../helpers/plugin-fixtures.ts'
import { fileOf, useUsedAtoms } from '../helpers/used-atoms-fixture.ts'
import {
  ARGUMENT_ROWS,
  EXTEND,
  IMPORT,
  LITERAL_ROWS,
  REFERENCE_ROWS,
} from '../helpers/used-atoms-rows.ts'

registerIsolation()
const { read } = useUsedAtoms()

const DEV_CLOSING =
  'next build stops on these. The dev server keeps serving, without rules for atoms that only these calls apply.'

describe('AC-nextjs-used-atoms-17: AC-used-atoms-05, every other reference to the binding is a build error', () => {
  it.each(REFERENCE_ROWS)(
    '%s alone is one problem in its own file, never a warning',
    async (_row, file, text) => {
      const outcome = await read({ modules: { [file]: text } })

      expect(outcome.first).toMatch(/^1 problem in 1 file: /u)
      expect(outcome.problems.map((line) => fileOf(line))).toEqual([file])
      expect(outcome.printed.warnings).toEqual([])
      expect(outcome.record.directiveWarnings).toEqual([])
    },
  )

  it('with every row present, the one report lists every row', async () => {
    const modules = Object.fromEntries(REFERENCE_ROWS.map(([, file, text]) => [file, text]))
    const outcome = await read({ modules })

    expect(outcome.first).toMatch(/^15 problems in 15 files: /u)
    expect(
      outcome.problems.map((line) => fileOf(line)).toSorted((a, b) => a.localeCompare(b)),
    ).toEqual(REFERENCE_ROWS.map(([, file]) => file).toSorted((a, b) => a.localeCompare(b)))
  })

  it('every row that is application code also gives its problem on the dev terminal, in one report', async () => {
    const modules = Object.fromEntries(REFERENCE_ROWS.map(([, file, text]) => [file, text]))
    const outcome = await read({ modules, isDev: true })

    expect(outcome.printed.errors).toHaveLength(1)
    const [printed] = outcome.printed.errors
    expect(printed).toMatch(/^15 problems in 15 files: /u)
    for (const [, file] of REFERENCE_ROWS) expect(printed).toContain(`${file}:`)
    expect(printed!.endsWith(DEV_CLOSING)).toBe(true)
  })

  it('control: the same modules without the offending references build green, so each row reaches the rule', async () => {
    const modules = Object.fromEntries(
      REFERENCE_ROWS.map(([, file]) => [file, `${IMPORT}export const ok = cx('flex')\n`]),
    )
    const outcome = await read({ modules })

    expect(outcome.report).toBeUndefined()
    expect(outcome.atoms).toEqual(['flex'])
  })
})

describe('AC-nextjs-used-atoms-17: AC-used-atoms-10, anything else is a build error, never a warning', () => {
  const importNames = "export const N = 'flex'\n"

  it.each(ARGUMENT_ROWS)('%s is one problem under every onUnknown', async (_row, body) => {
    for (const onUnknown of ['error', 'warn', 'ignore'] as const) {
      const outcome = await read({
        modules: { 'components/row.js': `${IMPORT}${body}\n` },
        options: { onUnknown },
      })

      expect(outcome.first, onUnknown).toMatch(/^1 problem in 1 file: /u)
      expect(outcome.printed.warnings, onUnknown).toEqual([])
      expect(outcome.record.directiveWarnings, onUnknown).toEqual([])
    }
  })

  it('an import from another module fails the same way', async () => {
    const outcome = await read({
      modules: {
        'components/names.js': importNames,
        'components/row.js': `${IMPORT}import { N } from './names.js'\ncx(N)\n`,
      },
    })

    expect(outcome.first).toMatch(/^1 problem in 1 file: /u)
    expect(outcome.problems.map((line) => fileOf(line))).toEqual(['components/row.js'])
  })

  it.each(['flex gap', 'flex ', ' flex'])(
    "the whitespace row cx('%s') says the string holds two names or whitespace, never unknown atom alone",
    async (literal) => {
      const outcome = await read({
        modules: { 'components/row.js': `${IMPORT}cx('${literal}')\n` },
      })

      expect(outcome.problems).toHaveLength(1)
      expect(outcome.problems[0]).toMatch(/whitespace|two atom names/u)
      expect(outcome.problems[0]).not.toMatch(/unknown atom/u)
    },
  )

  it('control: the same call with a name that is an atom is green', async () => {
    const outcome = await read({ modules: { 'components/row.js': `${IMPORT}cx('flex')\n` } })

    expect(outcome.report).toBeUndefined()
  })
})

/**
 * A module that calls `cx` with the literal.
 */
function callModule(literal: string): string {
  return `${IMPORT}cx('${literal}')\n`
}

describe('AC-nextjs-used-atoms-17: AC-used-atoms-11, a literal that is no atom name, with extend atoms out of the hint', () => {
  const hinted = LITERAL_ROWS.filter((row): row is [string, string] => row[1] !== undefined)
  const unhinted = LITERAL_ROWS.filter((row) => row[1] === undefined).map(([literal]) => literal)

  it.each(hinted)('cx(%s) alone is one problem carrying its hint', async (literal, hint) => {
    const outcome = await read({
      modules: { 'components/row.js': callModule(literal) },
      options: { extend: EXTEND },
    })

    expect(outcome.first).toMatch(/^1 problem in 1 file: /u)
    expect(outcome.problems[0]).toContain(`unknown atom "${literal}"`)
    expect(outcome.problems[0]).toContain(hint)
  })

  it.each(unhinted)('cx(%s) alone is one problem with no hint', async (literal) => {
    const outcome = await read({
      modules: { 'components/row.js': callModule(literal) },
      options: { extend: EXTEND },
    })

    expect(outcome.first).toMatch(/^1 problem in 1 file: /u)
    expect(outcome.problems[0]).toContain(`unknown atom "${literal}"`)
    expect(outcome.problems[0]).not.toContain('Did you mean')
  })

  it("the 'sr-only' and 'nave-flex' rows end with the camelCase sentence naming the class", async () => {
    const srOnly = await read({
      modules: { 'components/row.js': callModule('sr-only') },
      options: { extend: EXTEND },
    })
    const naveFlex = await read({
      modules: { 'components/row.js': callModule('nave-flex') },
      options: { extend: EXTEND },
    })

    expect(srOnly.problems[0]).toContain('"nave-sr-only" is its class.')
    expect(naveFlex.problems[0]).toContain('Did you mean "flex"?')
  })

  it('with all rows together the Available line appears once, last, in definition order, with no extend atom', async () => {
    const modules = Object.fromEntries(
      LITERAL_ROWS.map(([literal], index) => [`components/r${index}.js`, callModule(literal)]),
    )
    const outcome = await read({ modules, options: { extend: EXTEND } })
    const lines = outcome.text.split('\n')

    expect(outcome.first).toMatch(/^6 problems in 6 files: /u)
    expect(lines.filter((line) => line.startsWith('Available: '))).toHaveLength(1)
    expect(lines.at(-1)).toBe(`Available: ${Object.keys(builtInAtoms).join(', ')}`)
    expect(outcome.text).not.toContain('brandBox,')
    expect(lines.at(-1)).not.toContain('brandBox')
  })

  it('cx(brandBox) is an atom of the consumer’s own with no class, and names @nave brandBox as the remedy', async () => {
    const outcome = await read({
      modules: { 'components/row.js': callModule('brandBox') },
      options: { extend: EXTEND },
    })

    expect(outcome.first).toMatch(/^1 problem in 1 file: /u)
    expect(outcome.text).toContain('"brandBox" is an atom of your own, which has no class')
    expect(outcome.text).toContain('@nave brandBox')
  })
})
