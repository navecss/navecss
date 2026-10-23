import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'

import type { LoadedRegistry } from './support/registry/load.ts'

import { cloneRegistry, loadRegistry } from './support/registry/load.ts'
import { independenceProblems } from './support/registry/struct-dependencies.ts'
import { specifiersOf } from './support/registry/struct-imports.ts'
import { addFile, editFile, itemIn, itemsOf, removeFile } from './support/registry/struct-mutate.ts'
import {
  homepageFromRepository,
  indexProblems,
  itemFileName,
  setProblems,
  styledSubpathsIn,
} from './support/registry/struct-set.ts'
import {
  componentSubpaths,
  manifestOf,
  styledSubpaths,
} from './support/registry/styled-subpaths.ts'
import { PACKAGE_DIR } from './support/stylesheet.ts'

const scratch: string[] = []

afterAll(() => {
  for (const directory of scratch) rmSync(directory, { force: true, recursive: true })
})

/**
 * A temporary package directory holding the real manifest and every generated module, for a control
 * that edits a module.
 */
const copyOfGeneratedModules = (): string => {
  const directory = mkdtempSync(path.join(tmpdir(), 'registry-set-'))
  scratch.push(directory)
  cpSync(path.join(PACKAGE_DIR, 'package.json'), path.join(directory, 'package.json'))
  for (const subpath of componentSubpaths()) {
    mkdirSync(path.join(directory, 'src', subpath), { recursive: true })
    cpSync(
      path.join(PACKAGE_DIR, 'src', subpath, 'parts.generated.ts'),
      path.join(directory, 'src', subpath, 'parts.generated.ts'),
    )
  }
  return directory
}

const renamedDialog = (name: string): LoadedRegistry => {
  const registry = cloneRegistry(loadRegistry())
  const item = { ...itemIn(registry, 'base-ui-dialog'), name }
  registry.raw.set('base-ui-dialog.json', `${JSON.stringify(item, undefined, 2)}\n`)
  return registry
}

describe('AC-base-ui-registry-01: the registry holds one item per styled subpath and the index, and nothing else', () => {
  it('derives the styled subpaths from the manifest and the generated modules, and the set is not empty', () => {
    const styled = styledSubpaths()
    expect(styled.length).toBeGreaterThan(0)
    expect(styledSubpathsIn(PACKAGE_DIR)).toEqual(styled)
    for (const subpath of styled) expect(componentSubpaths()).toContain(subpath)
  })

  it('has base-ui-<s>.json named base-ui-<s> for every styled subpath, registry.json, and no other file', () => {
    const registry = loadRegistry()
    expect(setProblems(registry, styledSubpaths())).toEqual([])
    expect(registry.fileNames).toContain('registry.json')
  })

  it('has no item for a subpath that is not styled', () => {
    const registry = loadRegistry()
    const styled = new Set(styledSubpaths())
    const unstyled = componentSubpaths().filter((subpath) => !styled.has(subpath))
    expect(
      registry.fileNames.filter((name) => unstyled.some((s) => name === itemFileName(s))),
    ).toEqual([])
  })

  it('has no item named registry', () => {
    const names = loadRegistry().items.keys().toArray()
    expect(names).not.toContain('registry')
  })

  it('control: deleting base-ui-dialog.json reds the check naming the file', () => {
    const registry = cloneRegistry(loadRegistry())
    removeFile(registry, 'base-ui-dialog.json')
    expect(setProblems(registry, styledSubpaths())).toEqual(['base-ui-dialog.json is missing'])
  })

  it('control: adding base-ui-zzz.json reds the check naming the file', () => {
    const registry = cloneRegistry(loadRegistry())
    addFile(registry, 'base-ui-zzz.json', '{"name":"base-ui-zzz"}\n')
    expect(setProblems(registry, styledSubpaths())).toEqual([
      'base-ui-zzz.json is not an item of a styled subpath, nor the index',
    ])
  })

  it('control: an item for a subpath that is not styled (base-ui-form.json) reds the check', () => {
    const registry = cloneRegistry(loadRegistry())
    addFile(registry, 'base-ui-form.json', '{"name":"base-ui-form"}\n')
    expect(setProblems(registry, styledSubpaths())).toEqual([
      'base-ui-form.json is not an item of a styled subpath, nor the index',
    ])
  })

  it('control: an item whose name is not its file name reds the check, and so does one named registry', () => {
    expect(setProblems(renamedDialog('base-ui-popover'), styledSubpaths())).toEqual([
      'base-ui-dialog.json is named base-ui-popover',
    ])
    expect(setProblems(renamedDialog('registry'), styledSubpaths())).toContain(
      'base-ui-dialog.json is an item named registry',
    )
  })

  it('control: a generated module stripped of its classes in a temp copy removes its subpath from the expected set', () => {
    const directory = copyOfGeneratedModules()
    expect(styledSubpathsIn(directory)).toEqual(styledSubpaths())
    const generated = path.join(directory, 'src/dialog/parts.generated.ts')
    writeFileSync(generated, readFileSync(generated, 'utf8').replaceAll('nave-base-ui-', 'plain-'))
    const stripped = styledSubpathsIn(directory)
    expect(stripped).not.toContain('dialog')
    expect(stripped).toEqual(styledSubpaths().filter((subpath) => subpath !== 'dialog'))
    expect(setProblems(loadRegistry(), stripped)).toEqual([
      'base-ui-dialog.json is not an item of a styled subpath, nor the index',
    ])
  })

  it('control: a directory holding only the manifest and no module has an empty styled set', () => {
    const directory = copyOfGeneratedModules()
    const modules = readdirSync(path.join(directory, 'src'))
    for (const subpath of modules) {
      rmSync(path.join(directory, 'src', subpath), { force: true, recursive: true })
    }
    expect(styledSubpathsIn(directory)).toEqual([])
  })
})

const homepage = (): string => {
  const repository = (manifestOf() as unknown as { repository: { directory: string; url: string } })
    .repository
  return homepageFromRepository(repository)
}
const itemNames = (): string[] => styledSubpaths().map((subpath) => `base-ui-${subpath}`)

describe('AC-base-ui-registry-03: the index is the CLI schema, Nave, and carries no content', () => {
  it('derives the homepage from the repository as npm does, and it is the address the spec names', () => {
    expect(homepage()).toBe('https://github.com/navecss/navecss/tree/main/packages/base-ui#readme')
  })

  it('validates against the pinned CLI registrySchema, is named navecss, has the homepage, and lists exactly the items with their files and no content', () => {
    expect(itemNames().length).toBeGreaterThan(0)
    expect(indexProblems(loadRegistry(), itemNames(), homepage())).toEqual([])
  })

  it('control: adding content to one file entry of the index reds the check naming the item and file', () => {
    const registry = cloneRegistry(loadRegistry())
    const entry = registry.index.items.find((candidate) => candidate.name === 'base-ui-dialog')!
    entry.files[0]!.content = 'x'
    expect(indexProblems(registry, itemNames(), homepage())).toEqual([
      `base-ui-dialog: the index carries content for ${entry.files[0]!.path}`,
    ])
  })

  it('control: a wrong name, a wrong homepage, an item left out and an extra item each red the check', () => {
    const wrongName = cloneRegistry(loadRegistry())
    wrongName.index.name = 'shadcn'
    expect(indexProblems(wrongName, itemNames(), homepage())).toEqual([
      'registry.json is named shadcn',
    ])

    const wrongHomepage = cloneRegistry(loadRegistry())
    wrongHomepage.index.homepage = 'https://example.com'
    expect(indexProblems(wrongHomepage, itemNames(), homepage())).toHaveLength(1)

    const left = cloneRegistry(loadRegistry())
    left.index.items = left.index.items.filter((entry) => entry.name !== 'base-ui-dialog')
    expect(indexProblems(left, itemNames(), homepage())).toEqual([
      'base-ui-dialog is not in the index',
    ])

    const extra = cloneRegistry(loadRegistry())
    extra.index.items.push({ ...extra.index.items[0]!, name: 'base-ui-zzz' })
    expect(indexProblems(extra, itemNames(), homepage())).toEqual([
      'base-ui-zzz is in the index and is not an item',
    ])
  })

  it('control: two files of an entry swapped, or one dropped, or a target changed, reds the check naming the item', () => {
    const swapped = cloneRegistry(loadRegistry())
    const entry = swapped.index.items.find((candidate) => candidate.name === 'base-ui-dialog')!
    entry.files = [entry.files[1]!, entry.files[0]!, ...entry.files.slice(2)]
    expect(indexProblems(swapped, itemNames(), homepage())).toEqual([
      'base-ui-dialog: the index lists other files, or the same in another order',
    ])

    const dropped = cloneRegistry(loadRegistry())
    dropped.index.items.find((candidate) => candidate.name === 'base-ui-dialog')!.files.pop()
    expect(indexProblems(dropped, itemNames(), homepage())).toEqual([
      'base-ui-dialog: the index lists other files, or the same in another order',
    ])

    const retargeted = cloneRegistry(loadRegistry())
    retargeted.index.items.find(
      (candidate) => candidate.name === 'base-ui-dialog',
    )!.files[0]!.target = 'components/nave/other.ts'
    expect(indexProblems(retargeted, itemNames(), homepage())).toEqual([
      'base-ui-dialog: the index lists other files, or the same in another order',
    ])
  })

  it('control: an index the schema rejects reds the check', () => {
    const registry = cloneRegistry(loadRegistry())
    registry.index.items[0]!.files[0]!.type = 'not-a-type'
    expect(
      indexProblems(registry, itemNames(), homepage()).some((problem) =>
        problem.startsWith('registry.json: '),
      ),
    ).toBe(true)
  })
})

describe('AC-base-ui-registry-12: no item depends on another', () => {
  it('has no registryDependencies key and no relative import outside its own files, over a non-empty set of relative imports', () => {
    const registry = loadRegistry()
    expect(registry.items.size).toBeGreaterThan(0)
    expect(independenceProblems(registry)).toEqual([])
    const relativeImports = itemsOf(registry).flatMap((item) =>
      item.files.flatMap((file) =>
        specifiersOf(path.posix.basename(file.target), file.content ?? '').filter((specifier) =>
          specifier.startsWith('.'),
        ),
      ),
    )
    expect(relativeImports.length).toBeGreaterThan(0)
  })

  it('control: base-ui-button planted in base-ui-dialog registryDependencies reds the check naming the item', () => {
    const registry = cloneRegistry(loadRegistry())
    itemIn(registry, 'base-ui-dialog').registryDependencies = ['base-ui-button']
    expect(independenceProblems(registry)).toEqual([
      'base-ui-dialog: has a registryDependencies key',
    ])
  })

  it('control: an empty registryDependencies array still reds the check (no key at all)', () => {
    const registry = cloneRegistry(loadRegistry())
    itemIn(registry, 'base-ui-dialog').registryDependencies = []
    expect(independenceProblems(registry)).toEqual([
      'base-ui-dialog: has a registryDependencies key',
    ])
  })

  it('control: a relative import of another item, of the package source and of a parent directory each red the check', () => {
    for (const planted of [
      "import './nave-button.parts'",
      "import { part } from '../part.ts'",
      "export * from './nave-dialog.missing'",
    ]) {
      const registry = cloneRegistry(loadRegistry())
      editFile(
        registry,
        'base-ui-dialog',
        'nave-dialog.parts.ts',
        (content) => `${content}\n${planted}\n`,
      )
      const specifier = /'([^']+)'/.exec(planted)![1]!
      expect(independenceProblems(registry)).toEqual([
        `base-ui-dialog: nave-dialog.parts.ts imports ${specifier}, outside the item's files`,
      ])
    }
  })
})
