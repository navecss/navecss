import { spawnSync } from 'node:child_process'
import {
  cpSync,
  existsSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { main } from '../scripts/generate-registry.ts'
import { moduleBody } from '../scripts/registry/module-css.ts'
import { validateItem } from '../scripts/registry/validate.ts'
import { stringsFor } from '../scripts/registry/words.ts'
import { loadRegistry } from './support/registry/load.ts'
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

  it('writes registry.json in the same order under any locale', () => {
    // Czech sorts "ch" as a letter after "h", so `chip` follows `hover` unless the order is by code unit.
    const environment = { ...process.env, LC_ALL: 'cs_CZ.UTF-8' }
    const locale = spawnSync(
      process.execPath,
      ['-e', 'process.stdout.write(new Intl.Collator().resolvedOptions().locale)'],
      { encoding: 'utf8', env: environment },
    )
    expect(locale.stdout, 'LC_ALL took effect in the spawned process').toMatch(/^cs/)
    const out = path.join(directory(), 'registry')
    const run = spawnSync(process.execPath, ['scripts/generate-registry.ts', '--out', out], {
      cwd: PACKAGE_DIR,
      encoding: 'utf8',
      env: environment,
    })
    expect(run.status, run.stderr).toBe(0)
    expect(readFileSync(path.join(out, 'registry.json'), 'utf8')).toBe(
      loadRegistry().raw.get('registry.json'),
    )
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
    [
      'a @ts- directive',
      { ...item, files: [{ ...item.files[0]!, content: '// @ts-expect-error' }] },
    ],
    [
      'a stylelint suppression',
      { ...item, files: [{ ...item.files[0]!, content: '/* stylelint-disable */' }] },
    ],
  ])('refuses %s, naming the item', (_label, bad) => {
    expect(() => validateItem(bad)).toThrow('base-ui-x')
  })
})

interface ProbeAtom {
  declarations: Record<string, string>
  media?: Record<string, { declarations: Record<string, string> }>
  pseudos?: Record<string, Record<string, string>>
}

const inputsFor = (
  atom: ProbeAtom,
): {
  atoms: Record<string, ProbeAtom>
  focusRingAtoms: string[]
  orderStatement: string
  used: Set<string>
} => ({
  atoms: { baseUiProbe: atom },
  focusRingAtoms: [],
  orderStatement: '@layer a, b;',
  used: new Set(['baseUiProbe']),
})

const inputs = (
  declarations: Record<string, string>,
  pseudos?: Record<string, Record<string, string>>,
): ReturnType<typeof inputsFor> => inputsFor({ declarations, ...(pseudos && { pseudos }) })

const RING = {
  'outline-color': 'red',
  'outline-offset': '2px',
  'outline-style': 'solid',
  'outline-width': '2px',
}

describe('the outlines a module may carry', () => {
  it('refuses outline: 0, and an outline: none that no focus ring follows, naming the atom', async () => {
    await expect(moduleBody(inputs({ outline: '0' }))).rejects.toThrow('baseUiProbe')
    await expect(moduleBody(inputs({ outline: 'none' }))).rejects.toThrow('baseUiProbe')
  })

  it('puts the disable comment before an outline: none that a ring follows', async () => {
    const body = await moduleBody(inputs({ outline: 'none' }, { '&:focus-visible': RING }))
    expect(body).toContain('stylelint-disable-next-line')
    expect(body.indexOf('stylelint-disable-next-line')).toBeLessThan(body.indexOf('outline: none'))
  })

  it('refuses outline: 0 even where a ring follows', async () => {
    await expect(moduleBody(inputs({ outline: '0' }, { '&:focus-visible': RING }))).rejects.toThrow(
      'baseUiProbe',
    )
  })

  it('refuses outline: NONE, in any letter case, even where a ring follows', async () => {
    await expect(
      moduleBody(inputs({ outline: 'NONE' }, { '&:focus-visible': RING })),
    ).rejects.toThrow('baseUiProbe')
  })

  it('refuses outline: none !important, naming the atom and giving !important as the reason', async () => {
    const refused = moduleBody(inputs({ outline: 'none !important' }, { '&:focus-visible': RING }))
    await expect(refused).rejects.toThrow('baseUiProbe')
    await expect(refused).rejects.toThrow('!important')
    await expect(refused).rejects.not.toThrow('no &:focus-visible')
  })

  it.each(['outline-color', 'outline-offset', 'outline-style', 'outline-width'])(
    'refuses an outline: none whose ring does not set %s',
    async (property) => {
      const partial = Object.fromEntries(Object.entries(RING).filter(([name]) => name !== property))
      await expect(
        moduleBody(inputs({ outline: 'none' }, { '&:focus-visible': partial })),
      ).rejects.toThrow('baseUiProbe')
    },
  )

  it('refuses an outline: none whose ring comes before it', async () => {
    await expect(
      moduleBody(inputs({}, { '&:focus-visible': RING, '&': { outline: 'none' } })),
    ).rejects.toThrow('baseUiProbe')
  })

  it('accepts outline: none held alone in a & { } rule when the ring follows that rule, and comments it', async () => {
    const body = await moduleBody(
      inputs({ display: 'block' }, { '&': { outline: 'none' }, '&:focus-visible': RING }),
    )
    expect(body.indexOf('stylelint-disable-next-line')).toBeGreaterThan(-1)
    expect(body.indexOf('stylelint-disable-next-line')).toBeLessThan(body.indexOf('outline: none'))
  })

  it('refuses outline: none in a & { } rule that holds another declaration, naming the atom', async () => {
    await expect(
      moduleBody(
        inputs(
          { display: 'block' },
          { '&': { color: 'red', outline: 'none' }, '&:focus-visible': RING },
        ),
      ),
    ).rejects.toThrow(/^module\.css: baseUiProbe /)
  })

  it('refuses an outline: none inside an at-rule, naming the atom and never &', async () => {
    const atom: ProbeAtom = {
      declarations: { display: 'block' },
      media: { '(min-width: 1px)': { declarations: { outline: 'none' } } },
      pseudos: { '&:focus-visible': RING },
    }
    await expect(moduleBody(inputsFor(atom))).rejects.toThrow(/^module\.css: baseUiProbe /)
  })
})
