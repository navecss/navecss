import { spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'

import { cloneRegistry, loadRegistry } from './support/registry/load.ts'
import { fileIn, itemIn, itemsOf } from './support/registry/struct-mutate.ts'
import { isPlainNaveTarget, universalProblems } from './support/registry/struct-universal.ts'
import { PACKAGE_DIR } from './support/stylesheet.ts'

const RUNNER = path.join(PACKAGE_DIR, 'test/support/registry/struct-plant.ts')

const scratch: string[] = []

afterAll(() => {
  for (const directory of scratch) rmSync(directory, { force: true, recursive: true })
})

const runPlanted = (mode: string): { directory: string; output: string; status: number | null } => {
  const directory = mkdtempSync(path.join(tmpdir(), 'registry-plant-'))
  scratch.push(directory)
  const out = path.join(directory, 'registry')
  const run = spawnSync(process.execPath, [RUNNER, mode, out], {
    cwd: PACKAGE_DIR,
    encoding: 'utf8',
    timeout: 120_000,
  })
  return { directory: out, output: `${run.stdout}${run.stderr}`, status: run.status }
}

const writtenItems = (directory: string): string[] =>
  existsSync(directory) ? readdirSync(directory).filter((name) => name.endsWith('.json')) : []

const withDialogFile = (
  base: string,
  change: (file: { target: string; type: string }) => void,
): ReturnType<typeof cloneRegistry> => {
  const registry = cloneRegistry(loadRegistry())
  change(fileIn(itemIn(registry, 'base-ui-dialog'), base))
  return registry
}

describe('AC-base-ui-registry-04: every item is a universal item', () => {
  it('validates every item with the pinned CLI registryItemSchema, over a non-empty registry', () => {
    const registry = loadRegistry()
    expect(registry.items.size).toBeGreaterThan(0)
    expect(universalProblems(registry)).toEqual([])
  })

  it('has type registry:item, and only registry:file files whose target is a plain components/nave/ path', () => {
    const registry = loadRegistry()
    const files = itemsOf(registry).flatMap((item) => item.files)
    expect(files.length).toBeGreaterThan(0)
    for (const item of registry.items.values()) expect(item.type).toBe('registry:item')
    for (const file of files) {
      expect(file.type).toBe('registry:file')
      expect(file.target.startsWith('components/nave/')).toBe(true)
      expect(file.target).not.toMatch(/[@~{}$<>\\]|\.\./)
    }
  })

  it('control: one file typed registry:ui reds the check naming the item and the file', () => {
    const registry = withDialogFile('nave-dialog.wrap.ts', (file) => {
      file.type = 'registry:ui'
    })
    expect(universalProblems(registry)).toEqual([
      'base-ui-dialog: nave-dialog.wrap.ts has type registry:ui, not registry:file',
    ])
  })

  it('control: a registry:component file, an item typed registry:ui and an item with no type each red the check', () => {
    expect(
      universalProblems(
        withDialogFile('nave-dialog.ts', (file) => {
          file.type = 'registry:component'
        }),
      ),
    ).toEqual(['base-ui-dialog: nave-dialog.ts has type registry:component, not registry:file'])
    const retyped = cloneRegistry(loadRegistry())
    itemIn(retyped, 'base-ui-dialog').type = 'registry:ui'
    expect(universalProblems(retyped)).toContain('base-ui-dialog: has type registry:ui')
  })

  it.each([
    ['an @ alias', '@components/nave/x.ts'],
    ['a ~ home', '~/components/nave/x.ts'],
    ['a parent segment', 'components/nave/../x.ts'],
    ['a placeholder', 'components/nave/{name}.ts'],
    ['a leading slash', '/components/nave/x.ts'],
    ['another directory', 'src/components/nave/x.ts'],
    ['a backslash', String.raw`components\nave\x.ts`],
    ['an empty target', ''],
  ])('control: a target with %s reds the check naming the item and the file', (_form, target) => {
    const registry = withDialogFile('nave-dialog.module.css', (file) => {
      file.target = target
    })
    const problems = universalProblems(registry)
    expect(problems.length).toBeGreaterThan(0)
    expect(problems.every((problem) => problem.startsWith('base-ui-dialog: '))).toBe(true)
    expect(problems.some((problem) => problem.includes(`has target ${target}`))).toBe(true)
  })

  it('control: the predicate admits a plain target and refuses each non-plain form', () => {
    expect(isPlainNaveTarget('components/nave/nave-dialog.ts')).toBe(true)
    expect(isPlainNaveTarget('components/nave/NAVECSS-LICENSE')).toBe(true)
    expect(isPlainNaveTarget('components/nave/')).toBe(false)
    expect(isPlainNaveTarget('components/naves/x.ts')).toBe(false)
    expect(isPlainNaveTarget('components/nave/a b.ts')).toBe(false)
  })

  describe('the build refuses a bad item, through its own entry point', () => {
    it('control: a run with nothing planted exits 0 and writes the items, so a refusal below is the planted file', () => {
      const run = runPlanted('none')
      expect(run.output).not.toContain('PLANT-FAILED')
      expect(run.status).toBe(0)
      expect(writtenItems(run.directory)).toContain('base-ui-dialog.json')
    })

    it('exits non-zero, naming base-ui-dialog and the file, when one file is typed registry:ui', () => {
      const run = runPlanted('retype')
      expect(run.output).not.toContain('PLANT-FAILED')
      expect(run.status).not.toBe(0)
      expect(run.status).not.toBeNull()
      expect(run.output).toContain('base-ui-dialog')
      expect(run.output).toContain('nave-dialog.wrap.ts')
      expect(writtenItems(run.directory)).toEqual([])
    })

    it('exits non-zero, naming base-ui-dialog and the file, when one target is @components/nave/x.ts', () => {
      const run = runPlanted('retarget')
      expect(run.output).not.toContain('PLANT-FAILED')
      expect(run.status).not.toBe(0)
      expect(run.status).not.toBeNull()
      expect(run.output).toContain('base-ui-dialog')
      expect(
        run.output.includes('nave-dialog.module.css') ||
          run.output.includes('@components/nave/x.ts'),
      ).toBe(true)
      expect(writtenItems(run.directory)).toEqual([])
    })
  })
})
