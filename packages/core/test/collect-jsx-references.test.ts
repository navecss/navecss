/**
 * A JSX attribute string means what JSX makes of it. A character reference in it (`&#45;`,
 * `&#x2d;`) is the character it names by the time the page runs, so `className="nave&#45;flex"`
 * puts `nave-flex` on the element and the reader reads `flex`. Neither Vite's parser nor
 * oxc-parser decodes the reference in the tree it returns: the attribute's `value` is the text as
 * written. So the reader decodes it the way Vite's JSX compiler does: a decimal reference, or a
 * hexadecimal one written with a lowercase `x`, ending in a semicolon and naming a Unicode scalar
 * value. A named reference never spells a character of an atom's class (`&hyphen;` is not even
 * decoded by JSX), and a JavaScript string is not JSX: each is read as written. Checked on the
 * source and on the built `@navecss/core/collect` entry, which needs a build.
 */
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { parseAst } from 'vite'
import { describe, expect, it } from 'vitest'

import type { AstNode } from '../src/vite-ast.ts'

import { recordModule } from '../src/vite-collect-module.ts'
import { CX_SOURCE, type ModuleReading, readModule, type ReadOptions } from '../src/vite-collect.ts'
import { createExtendSource } from '../src/vite-extend.ts'
import { resolveUsedOptions } from '../src/vite-options.ts'
import { createUsedContext } from '../src/vite-used.ts'

const OPTIONS: ReadOptions = {
  cxSources: new Set([CX_SOURCE]),
  ownAtoms: new Set(),
  isDependency: false,
}

type Read = (code: string, program: AstNode, options: ReadOptions) => ModuleReading

/**
 * The classes `read` finds in `code`, parsed as JSX by Vite's parser, sorted.
 */
function classesIn(code: string, read: Read = readModule): string[] {
  const program = parseAst(code, { lang: 'jsx' }) as unknown as AstNode
  return [...read(code, program, OPTIONS).classes].toSorted((a, b) => a.localeCompare(b))
}

describe('a JSX attribute string is read by the text JSX makes of it', () => {
  it.each([
    ['a decimal reference', '<div className="nave&#45;flex" />', ['flex']],
    ['a hexadecimal reference', '<div className="nave&#x2d;flex" />', ['flex']],
    ['a hexadecimal reference in capitals', '<div className="nave&#x2D;flex" />', ['flex']],
    ['a reference with leading zeros', '<div className="nave&#00045;flex" />', ['flex']],
    ['a reference in single quotes', "<div className='&#110;ave-grid' />", ['grid']],
    [
      'two classes, each with one',
      '<div className="nave-&#102;lex nave&#45;grid" />',
      ['flex', 'grid'],
    ],
    ['an attribute that is not className', '<div data-x="nave&#45;block" />', ['block']],
  ])('%s', (_name, element, expected) => {
    expect(classesIn(`export const A = () => ${element}\n`)).toEqual(expected)
  })

  it('a class written with no reference reads as before', () => {
    expect(classesIn('export const A = () => <div className="nave-flex nave-grid" />\n')).toEqual([
      'flex',
      'grid',
    ])
  })
})

describe('text JSX leaves as written is read as written', () => {
  it.each([
    ['a named reference JSX does not decode', '<div className="nave&hyphen;flex" />'],
    ['a hexadecimal reference with a capital X', '<div className="nave&#X2d;flex" />'],
    ['a reference with no semicolon', '<div className="nave&#45flex" />'],
    ['a reference past the last code point', '<div className="nave&#1114112;flex" />'],
    ['a reference in the text of an element', '<p>nave&#45;flex</p>'],
  ])('%s', (_name, element) => {
    expect(classesIn(`export const A = () => ${element}\n`)).toEqual([])
  })

  it('a JavaScript string is not JSX: its reference stays as written', () => {
    expect(classesIn("export const s = 'nave&#45;flex'\n")).toEqual([])
  })
})

describe('the built @navecss/core/collect entry', () => {
  it('reads a JSX attribute string by the text JSX makes of it', async () => {
    const entry = path.join(import.meta.dirname, '..', 'dist', 'collect.js')
    const collect = (await import(pathToFileURL(entry).href)) as { readModule: Read }

    expect(
      classesIn('export const A = () => <div className="nave&#45;flex" />\n', collect.readModule),
    ).toEqual(['flex'])
  })
})

/**
 * The atoms the Vite plugin records for `code`, a JSX module the host has not compiled, or
 * `undefined` when it skips the module as naming none.
 */
async function recordedAtoms(code: string): Promise<string[] | undefined> {
  const context = createUsedContext(resolveUsedOptions({}), createExtendSource(undefined))
  context.root = '/app'
  const ctx = {
    environment: { name: 'client', config: { consumer: 'client' }, plugins: [] },
    parse: (text: string, options?: { lang?: 'jsx' }) => parseAst(text, options),
    getCombinedSourcemap: () => ({ sources: [], mappings: '' }),
    addWatchFile() {},
  } as never
  const record = await recordModule(context, ctx, {
    code,
    id: '/app/src/page.jsx',
    moduleType: 'jsx',
  })
  return record && [...record.atoms].toSorted((a, b) => a.localeCompare(b))
}

describe('the Vite plugin reads a module whose only mention of an atom is a character reference', () => {
  it('ships grid for className="&#110;ave-grid"', async () => {
    expect(
      await recordedAtoms('export const A = () => <div className="&#110;ave-grid" />\n'),
    ).toEqual(['grid'])
  })

  it('control: a module that names no atom at all is still skipped', async () => {
    expect(await recordedAtoms('export const A = () => <div className="card" />\n')).toBeUndefined()
  })
})
