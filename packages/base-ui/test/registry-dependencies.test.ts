import path from 'node:path'
import { describe, expect, it } from 'vitest'

import type { LoadedRegistry } from './support/registry/load.ts'

import { byCodeUnit, cloneRegistry, loadRegistry } from './support/registry/load.ts'
import {
  dependencyProblems,
  forbiddenImportProblems,
  type PeerManifest,
} from './support/registry/struct-dependencies.ts'
import {
  isInsidePackage,
  specifiersOf,
  specifiersOfStylesheet,
  specifiersOfTypeScript,
} from './support/registry/struct-imports.ts'
import { editFile, itemIn, itemsOf } from './support/registry/struct-mutate.ts'
import { manifestOf } from './support/registry/styled-subpaths.ts'

const manifest = (): PeerManifest => {
  const { peerDependencies, version } = manifestOf()
  return { peerDependencies, version }
}

const withDialog = (change: (item: ReturnType<typeof itemIn>) => void): LoadedRegistry => {
  const registry = cloneRegistry(loadRegistry())
  change(itemIn(registry, 'base-ui-dialog'))
  return registry
}

const plantInParts = (line: string): LoadedRegistry => {
  const registry = cloneRegistry(loadRegistry())
  editFile(registry, 'base-ui-dialog', 'nave-dialog.parts.ts', (content) => `${content}\n${line}\n`)
  return registry
}

describe('AC-base-ui-registry-09: dependencies are the peer names, bare, and meta is flat', () => {
  it('has, in every item, dependencies equal to the manifest peer names as a set, with no specifier', () => {
    const { peerDependencies } = manifest()
    expect(Object.keys(peerDependencies).length).toBeGreaterThan(0)
    const registry = loadRegistry()
    expect(registry.items.size).toBeGreaterThan(0)
    for (const item of registry.items.values()) {
      expect(new Set(item.dependencies)).toEqual(new Set(Object.keys(peerDependencies)))
      expect(item.dependencies?.every((name) => !/.@/.test(name))).toBe(true)
    }
  })

  it('has no devDependencies or registryDependencies, and a meta of exactly version and peerDependencies', () => {
    expect(dependencyProblems(loadRegistry(), manifest())).toEqual([])
    for (const item of itemsOf(loadRegistry())) {
      expect(Object.keys(item.meta ?? {}).toSorted(byCodeUnit)).toEqual([
        'peerDependencies',
        'version',
      ])
    }
  })

  it('imports neither @navecss/core nor @navecss/base-ui in any copied file, over a non-empty set of imports', () => {
    const registry = loadRegistry()
    const specifiers = itemsOf(registry).flatMap((item) =>
      item.files.flatMap((file) =>
        specifiersOf(path.posix.basename(file.target), file.content ?? ''),
      ),
    )
    expect(specifiers.length).toBeGreaterThan(0)
    expect(specifiers).toContain('react')
    expect(specifiers.some((specifier) => specifier.startsWith('@base-ui/react/'))).toBe(true)
    expect(forbiddenImportProblems(registry)).toEqual([])
  })

  it('control: @base-ui/react@^1.3.0 planted in one item reds the check naming the item and the entry', () => {
    const registry = withDialog((item) => {
      item.dependencies = (item.dependencies ?? []).map((name) =>
        name === '@base-ui/react' ? '@base-ui/react@^1.3.0' : name,
      )
    })
    expect(dependencyProblems(registry, manifest())).toContain(
      'base-ui-dialog: dependency @base-ui/react@^1.3.0 carries a version specifier',
    )
  })

  it('control: a range on an unscoped name, a dist-tag and an extra dependency each red the check', () => {
    const ranged = withDialog((item) => {
      item.dependencies = (item.dependencies ?? []).map((name) =>
        name === 'react' ? 'react@^19' : name,
      )
    })
    expect(dependencyProblems(ranged, manifest())).toContain(
      'base-ui-dialog: dependency react@^19 carries a version specifier',
    )
    const extra = withDialog((item) => {
      item.dependencies?.push('lodash')
    })
    expect(dependencyProblems(extra, manifest())).toEqual([
      'base-ui-dialog: dependency lodash is not a peer dependency name',
    ])
    const dropped = withDialog((item) => {
      item.dependencies = (item.dependencies ?? []).filter((name) => name !== 'react-dom')
    })
    expect(dependencyProblems(dropped, manifest())).toEqual([
      'base-ui-dialog: peer dependency react-dom is missing from dependencies',
    ])
  })

  it('control: devDependencies, registryDependencies and a missing dependencies array each red the check', () => {
    expect(
      dependencyProblems(
        withDialog((item) => {
          item.devDependencies = ['vitest']
        }),
        manifest(),
      ),
    ).toEqual(['base-ui-dialog: has a devDependencies key'])
    expect(
      dependencyProblems(
        withDialog((item) => {
          item.registryDependencies = []
        }),
        manifest(),
      ),
    ).toEqual(['base-ui-dialog: has a registryDependencies key'])
    expect(
      dependencyProblems(
        withDialog((item) => {
          delete item.dependencies
        }),
        manifest(),
      ),
    ).toEqual(['base-ui-dialog: has no dependencies array'])
  })

  it('control: a meta with another key, another version or another peer range reds the check', () => {
    const otherKey = withDialog((item) => {
      item.meta = { ...item.meta, floor: '1.3.0' }
    })
    const otherVersion = withDialog((item) => {
      item.meta = { ...item.meta, version: '9.9.9' }
    })
    const otherRange = withDialog((item) => {
      item.meta = {
        ...item.meta,
        peerDependencies: { ...manifest().peerDependencies, react: '^19' },
      }
    })
    for (const registry of [otherKey, otherVersion, otherRange]) {
      const problems = dependencyProblems(registry, manifest())
      expect(problems).toHaveLength(1)
      expect(problems[0]).toMatch(/^base-ui-dialog: meta is /)
    }
  })

  it('control: a fifth peer added to a temp copy of the manifest moves the expected set', () => {
    const grown: PeerManifest = {
      ...manifest(),
      peerDependencies: { ...manifest().peerDependencies, 'left-pad': '^1.0.0' },
    }
    const problems = dependencyProblems(loadRegistry(), grown)
    expect(problems.length).toBeGreaterThan(0)
    expect(problems).toContain(
      'base-ui-dialog: peer dependency left-pad is missing from dependencies',
    )
    expect(problems.some((problem) => problem.includes('meta is'))).toBe(true)
  })

  it("control: import '@navecss/core/atoms' planted in one parts file reds the check naming the file", () => {
    expect(forbiddenImportProblems(plantInParts("import '@navecss/core/atoms'"))).toEqual([
      'base-ui-dialog: nave-dialog.parts.ts imports @navecss/core/atoms',
    ])
  })
})

describe('AC-base-ui-registry-09: the import reader, tried on a planted control for each specifier form', () => {
  const FORMS: readonly (readonly [string, string, string])[] = [
    ['side-effect import', "import '@navecss/core'", '@navecss/core'],
    ['default import', "import atoms from '@navecss/core/atoms'", '@navecss/core/atoms'],
    ['named import', "import { cx } from '@navecss/core'", '@navecss/core'],
    [
      'namespace import',
      "import * as nave from '@navecss/base-ui/dialog'",
      '@navecss/base-ui/dialog',
    ],
    ['import type', "import type { Atom } from '@navecss/core/types'", '@navecss/core/types'],
    ['inline type import', "import { type Atom } from '@navecss/core'", '@navecss/core'],
    ['export from', "export { Button } from '@navecss/base-ui/button'", '@navecss/base-ui/button'],
    ['export star', "export * from '@navecss/core'", '@navecss/core'],
    ['export type star', "export type * from '@navecss/base-ui'", '@navecss/base-ui'],
    ['dynamic import', "const loaded = await import('@navecss/core/atoms')", '@navecss/core/atoms'],
    ['import type node', "type Core = typeof import('@navecss/core')", '@navecss/core'],
    ['require call', "const core = require('@navecss/core')", '@navecss/core'],
    ['import equals', "import core = require('@navecss/core')", '@navecss/core'],
    [
      'a path into node_modules',
      "import '../node_modules/@navecss/core/dist/index.js'",
      '../node_modules/@navecss/core/dist/index.js',
    ],
    [
      'a double-quoted specifier on a split line',
      'import {\n  cx,\n} from\n  "@navecss/core"',
      '@navecss/core',
    ],
  ]

  it.each(FORMS)('the reader reads %s', (_form, line, specifier) => {
    expect(specifiersOfTypeScript('planted.ts', line)).toEqual([specifier])
  })

  it.each(FORMS)('control: %s planted in a parts file reds the check', (_form, line, specifier) => {
    expect(forbiddenImportProblems(plantInParts(line))).toEqual([
      `base-ui-dialog: nave-dialog.parts.ts imports ${specifier}`,
    ])
  })

  it('does not read a specifier that sits in a comment, a string or a template', () => {
    const source = [
      "// import '@navecss/core'",
      "/* import { x } from '@navecss/base-ui' */",
      'const text = "import \'@navecss/core/atoms\'"',
      "const template = `import('@navecss/core')`",
      "const plain = '@navecss/core'",
    ].join('\n')
    expect(specifiersOfTypeScript('planted.ts', source)).toEqual([])
  })

  it('does not red a registry whose parts file holds those comments, strings and templates', () => {
    const source = "// import '@navecss/core'\nconst text = \"import '@navecss/core/atoms'\"\n"
    expect(forbiddenImportProblems(plantInParts(source))).toEqual([])
  })

  it('does not read a peer, a Base UI subpath, a sibling file or a lookalike name as a forbidden package', () => {
    const allowed = [
      "import '@navecss/tokens/css'",
      "import * as Base from '@base-ui/react/dialog'",
      "import { wrapPart } from './nave-dialog.wrap'",
      "import '@navecss/coreish'",
      "import '@navecss/base-uikit'",
      "import 'navecss-core'",
    ]
    const specifiers = specifiersOfTypeScript('planted.ts', allowed.join('\n'))
    expect(specifiers).toHaveLength(allowed.length)
    expect(
      specifiers.filter(
        (specifier) =>
          isInsidePackage(specifier, '@navecss', 'core') ||
          isInsidePackage(specifier, '@navecss', 'base-ui'),
      ),
    ).toEqual([])
    expect(isInsidePackage('@navecss/coreish', '@navecss', 'core')).toBe(false)
    expect(isInsidePackage('@navecss/core', '@navecss', 'core')).toBe(true)
  })

  it('reads a stylesheet @import and a composes-from, and reds the check', () => {
    expect(specifiersOfStylesheet("@import '@navecss/core/layers.css';")).toEqual([
      '@navecss/core/layers.css',
    ])
    expect(specifiersOfStylesheet('@import url("@navecss/core/layers.css");')).toEqual([
      '@navecss/core/layers.css',
    ])
    expect(
      specifiersOfStylesheet(".a { composes: b from '@navecss/base-ui/styles.css'; }"),
    ).toEqual(['@navecss/base-ui/styles.css'])
    expect(specifiersOfStylesheet('.a { composes: b from global; }')).toEqual([])
    expect(specifiersOfStylesheet("/* @import '@navecss/core'; */ .a { color: red; }")).toEqual([])
    const registry = cloneRegistry(loadRegistry())
    editFile(
      registry,
      'base-ui-dialog',
      'nave-dialog.module.css',
      (content) => `${content}\n@import '@navecss/core/layers.css';\n`,
    )
    expect(forbiddenImportProblems(registry)).toEqual([
      'base-ui-dialog: nave-dialog.module.css imports @navecss/core/layers.css',
    ])
  })
})
