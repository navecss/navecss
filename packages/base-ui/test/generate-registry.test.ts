import { cpSync, existsSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { main } from '../scripts/generate-registry.ts'
import { moduleBody } from '../scripts/registry/module-css.ts'
import { validateItem } from '../scripts/registry/validate.ts'
import { stringsFor } from '../scripts/registry/words.ts'
import { PACKAGE_DIR } from './support/stylesheet.ts'

// The generator is exercised by the build and by criteria that read what it wrote. This file runs
// its own functions in this process, so the refusals are checked where they are decided.

const scratch: string[] = []
const directory = (): string => {
  const created = mkdtempSync(path.join(tmpdir(), 'generate-registry-'))
  scratch.push(created)
  return created
}

afterEach(() => {
  for (const created of scratch) rmSync(created, { force: true, recursive: true })
  scratch.length = 0
  vi.restoreAllMocks()
})

const refusal = (): string[] => {
  const written: string[] = []
  vi.spyOn(console, 'error').mockImplementation((line: string) => {
    written.push(line)
  })
  return written
}

describe('the registry generator, run in this process', () => {
  it('writes an item for every styled subpath and the index, and nothing else', async () => {
    const out = path.join(directory(), 'registry')
    expect(await main({ out })).toBe(0)
    const names = readdirSync(out)
    expect(names).toContain('registry.json')
    expect(names.filter((name) => name.startsWith('base-ui-')).length).toBeGreaterThan(30)
    expect(
      names.every((name) => name === 'registry.json' || /^base-ui-[\w-]+\.json$/.test(name)),
    ).toBe(true)
  }, 180_000)

  it('refuses an item that is not a universal item and writes none', async () => {
    const out = path.join(directory(), 'registry')
    const written = refusal()
    const code = await main({
      mutate: (items) => {
        const [first] = items
        if (first !== undefined) first.files[0]!.type = 'registry:ui'
      },
      out,
    })
    expect(code).toBe(1)
    expect(written.join('\n')).toContain('registry:ui')
    expect(existsSync(out) ? readdirSync(out) : []).toEqual([])
  }, 180_000)

  it('refuses a LICENSE with no copyright line, naming it', async () => {
    const root = directory()
    cpSync(path.join(PACKAGE_DIR, 'package.json'), path.join(root, 'package.json'))
    writeFileSync(path.join(root, 'LICENSE'), 'MIT License\n\nno copyright line here\n')
    const written = refusal()
    expect(await main({ out: path.join(root, 'out'), root })).toBe(1)
    expect(written.join('\n')).toContain('LICENSE')
  }, 180_000)

  it('reads --root and --out from the command line', async () => {
    const root = directory()
    cpSync(path.join(PACKAGE_DIR, 'package.json'), path.join(root, 'package.json'))
    cpSync(path.join(PACKAGE_DIR, 'LICENSE'), path.join(root, 'LICENSE'))
    const out = path.join(root, 'elsewhere')
    expect(await main({ argv: ['--root', root, '--out', out] })).toBe(0)
    expect(existsSync(path.join(out, 'registry.json'))).toBe(true)
  }, 180_000)
})

describe('the wording of an item, from the package manifest', () => {
  const peers = {
    '@base-ui/react': '^1.3.0',
    '@navecss/tokens': '>=0.4.0 <1.0.0',
    react: '^18 || ^19',
  }

  it('words the three range shapes, and fails on any other', () => {
    const { docs } = stringsFor('alert-dialog', '0.3.0', peers)
    expect(docs).toContain('1.3 or later in the 1.x line')
    expect(docs).toContain('0.4.0 or later before 1.0')
    expect(docs).toContain('React 18 or 19')
    expect(() => stringsFor('dialog', '0.3.0', { ...peers, react: '>=18 <20' })).toThrow('>=18 <20')
    expect(() => stringsFor('dialog', '0.3.0', { ...peers, '@base-ui/react': '^0.4.0' })).toThrow(
      '^0.4.0',
    )
    expect(() => stringsFor('dialog', '0.3.0', { react: '^18 || ^19' })).toThrow('@base-ui/react')
  })
})

describe('what the build refuses before it writes', () => {
  const item = {
    $schema: '',
    dependencies: [],
    description: '',
    docs: '',
    files: [
      {
        content: 'a',
        path: 'registry/nave/x.ts',
        target: 'components/nave/x.ts',
        type: 'registry:file',
      },
    ],
    meta: { peerDependencies: {}, version: '0' },
    name: 'base-ui-x',
    title: '',
    type: 'registry:item',
  }

  it('accepts a universal item', () => {
    expect(() => validateItem(item)).not.toThrow()
  })

  it.each([
    ['an item of another type', { ...item, type: 'registry:ui' }],
    ['a file of another type', { ...item, files: [{ ...item.files[0]!, type: 'registry:ui' }] }],
    [
      'a target outside components/nave',
      { ...item, files: [{ ...item.files[0]!, target: '@components/nave/x.ts' }] },
    ],
    [
      'a target that climbs',
      { ...item, files: [{ ...item.files[0]!, target: 'components/nave/../x.ts' }] },
    ],
    [
      'a lint suppression',
      { ...item, files: [{ ...item.files[0]!, content: '// eslint-disable-next-line x' }] },
    ],
  ])('refuses %s, naming the item', (_label, bad) => {
    expect(() => validateItem(bad)).toThrow('base-ui-x')
  })
})

interface ProbeAtom {
  declarations: Record<string, string>
  pseudos?: Record<string, Record<string, string>>
}

const inputs = (
  declarations: Record<string, string>,
  pseudos?: Record<string, Record<string, string>>,
): {
  atoms: Record<string, ProbeAtom>
  focusRingAtoms: string[]
  orderStatement: string
  used: Set<string>
} => ({
  atoms: { baseUiProbe: { declarations, ...(pseudos && { pseudos }) } },
  focusRingAtoms: [],
  orderStatement: '@layer a, b;',
  used: new Set(['baseUiProbe']),
})

describe('the outlines a module may carry', () => {
  it('refuses outline: 0, and an outline: none that no focus ring follows, naming the atom', async () => {
    await expect(moduleBody(inputs({ outline: '0' }))).rejects.toThrow('baseUiProbe')
    await expect(moduleBody(inputs({ outline: 'none' }))).rejects.toThrow('baseUiProbe')
  })

  it('puts the disable comment before an outline: none that a ring follows', async () => {
    const body = await moduleBody(
      inputs({ outline: 'none' }, { '&:focus-visible': { 'outline-style': 'solid' } }),
    )
    expect(body).toContain('stylelint-disable-next-line')
    expect(body.indexOf('stylelint-disable-next-line')).toBeLessThan(body.indexOf('outline: none'))
  })
})
