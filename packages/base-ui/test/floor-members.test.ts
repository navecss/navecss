/**
 * AC-base-ui-overlay-completion-51: every member the shipped wrappers read off a Base UI import
 * exists in the floor Base UI. webpack 5 reports a missing member of a module namespace as a build
 * error, so a wrapper that reads a part the floor lacks breaks the build of every app on the floor
 * that imports it, whether or not the app uses the part.
 */
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

import {
  type BaseUiImport,
  baseUiSpecifierCount,
  type ModuleText,
  problemsAgainst,
  readBaseUiImports,
} from './support/base-ui-reads.ts'
import { DIST_DIR, filesUnder } from './support/dist.ts'

/**
 * Base UI at the floor, 1.3.0, installed as `base-ui-react-floor`. The subpath is a literal path
 * of the package's export map.
 */
const loadFloor = (subpath: string): Promise<Record<string, unknown>> =>
  import(/* @vite-ignore */ `base-ui-react-floor/${subpath}`) as Promise<Record<string, unknown>>

const distModules = (): ModuleText[] =>
  filesUnder(DIST_DIR, ['.js']).map((file) => ({
    file,
    text: readFileSync(path.join(DIST_DIR, file), 'utf8'),
  }))

const membersOf = (imports: readonly BaseUiImport[], subpath: string): string[] =>
  imports.filter((entry) => entry.subpath === subpath).flatMap((entry) => [...entry.members])

const scratch: string[] = []
afterEach(() => {
  for (const directory of scratch) {
    rmSync(directory, { force: true, recursive: true })
  }
  scratch.length = 0
})

/**
 * The built Combobox wrapper module with one more line, which reads `createItems` the way the
 * given source says.
 */
const comboboxModuleWith = (line: string): ModuleText => {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'floor-members-'))
  scratch.push(directory)
  const file = path.join(directory, 'parts.generated.js')
  writeFileSync(
    file,
    `${readFileSync(path.join(DIST_DIR, 'combobox/parts.generated.js'), 'utf8')}${line}\n`,
  )
  return { file, text: readFileSync(file, 'utf8') }
}

describe('AC-base-ui-overlay-completion-51: every member the shipped wrappers read off a Base UI import exists at the floor', () => {
  it('reads no name and no member that Base UI 1.3.0 lacks', async () => {
    const imports = readBaseUiImports(distModules())
    expect(await problemsAgainst(imports, loadFloor)).toEqual([])
  })

  it('control: the parse reports as many Base UI imports as a text search of dist finds, so a parse that skips a module cannot pass', () => {
    const modules = distModules()
    const found = baseUiSpecifierCount(modules)
    expect(found).toBeGreaterThan(0)
    expect(readBaseUiImports(modules)).toHaveLength(found)
  })

  it('control: the list for combobox holds Root and useFilter, the list for menu holds createHandle, and menubar, which reads no member, is reported with none', () => {
    const imports = readBaseUiImports(distModules())
    expect(membersOf(imports, 'combobox')).toEqual(expect.arrayContaining(['Root', 'useFilter']))
    expect(membersOf(imports, 'menu')).toContain('createHandle')
    expect(imports.filter((entry) => entry.subpath === 'menubar')).toHaveLength(1)
    expect(membersOf(imports, 'menubar')).toEqual([])
  })

  it.each([
    ['Base.createItems', 'export const createItems = /*#__PURE__*/ (() => Base.createItems)();'],
    [
      "Base['createItems']",
      "export const createItems = /*#__PURE__*/ (() => Base['createItems'])();",
    ],
  ])(
    'control: a copy of the built Combobox module that reads %s reds the check, naming combobox and createItems',
    async (_form, line) => {
      const imports = readBaseUiImports([comboboxModuleWith(line)])
      expect(await problemsAgainst(imports, loadFloor)).toEqual([
        'combobox: createItems is not an export of Combobox',
      ])
    },
  )

  it('control: a name that is not an export of the Base UI module reds the check too', async () => {
    const imports = readBaseUiImports([
      {
        file: 'copy.js',
        text: "import { NotAComponent as Base } from '@base-ui/react/combobox';\nBase.Root;\n",
      },
    ])
    expect(await problemsAgainst(imports, loadFloor)).toEqual([
      'combobox: NotAComponent is not an export of @base-ui/react/combobox',
    ])
  })

  it('lists a member read by each of the five forms, and no computed key', () => {
    const imports = readBaseUiImports([
      {
        file: 'forms.js',
        text: [
          "import { Combobox as Base } from '@base-ui/react/combobox';",
          'export const a = Base.One;',
          "export const b = Base['Two'];",
          'export const c = Base[`Three`];',
          'export const d = Base?.Four;',
          'export const { Five, Six: six } = Base;',
          "export const e = Base['Sev' + 'en'];",
          'export const f = Base[key];',
        ].join('\n'),
      },
    ])
    expect(imports).toEqual([
      {
        file: 'forms.js',
        imported: 'Combobox',
        members: ['One', 'Two', 'Three', 'Four', 'Five', 'Six'],
        subpath: 'combobox',
      },
    ])
  })
})
