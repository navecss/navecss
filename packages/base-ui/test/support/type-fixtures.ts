/**
 * The TypeScript the type instruments compile, written from what the installed Base UI declares
 * and run through `tsc` against the built package: a fixture that names, for every subpath, every
 * type Base UI exports and every part's type namespace (AC-02), the assertions about the wrapped
 * parts' types (AC-15 and the overlay completion's -03 and -05), and the generic roots and the
 * rejected props of the six components the overlay completion adds.
 */
import { execFile } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { promisify } from 'node:util'

import type { BaseUiVersion, SubpathTypes } from '../../scripts/wrappers/read-types.ts'

import { isLeftOut } from './left-out.ts'
import { PACKAGE_DIR } from './stylesheet.ts'

const run = promisify(execFile)

export const BASE = '@base-ui/react'
export const NAVE = '@navecss/base-ui'

/**
The parts whose props gain `variant` and `size` (the Alert Dialog's two from the overlay
completion, and the Toast's two from the feedback and navigation release), by subpath and part
(`.` for the component).
 */
export const VARIANT_PARTS: readonly { kind: 'size' | 'variant'; part: string; subpath: string }[] =
  [
    { kind: 'variant', part: '.', subpath: 'button' },
    { kind: 'variant', part: 'Button', subpath: 'toolbar' },
    { kind: 'variant', part: 'Trigger', subpath: 'dialog' },
    { kind: 'variant', part: 'Close', subpath: 'dialog' },
    { kind: 'variant', part: 'Trigger', subpath: 'alert-dialog' },
    { kind: 'variant', part: 'Close', subpath: 'alert-dialog' },
    { kind: 'variant', part: 'Trigger', subpath: 'popover' },
    { kind: 'variant', part: 'Close', subpath: 'popover' },
    { kind: 'variant', part: 'Action', subpath: 'toast' },
    { kind: 'variant', part: 'Close', subpath: 'toast' },
    { kind: 'variant', part: 'Trigger', subpath: 'menu' },
    { kind: 'variant', part: 'Trigger', subpath: 'tooltip' },
    { kind: 'size', part: '.', subpath: 'toggle' },
  ]

const isVariantPart = (subpath: string, part: string): boolean =>
  VARIANT_PARTS.some((entry) => entry.subpath === subpath && entry.part === part)

/**
Whether a part is typed apart from Base UI's: the Button family and `Toggle`, and `Avatar.Root`,
whose props gain `size` of `'sm' | 'md' | 'lg'` (the feedback and navigation criterion -05 holds it).
 */
const isTypedApart = (subpath: string, part: string): boolean =>
  isVariantPart(subpath, part) || (subpath === 'avatar' && part === 'Root')

export const identifier = (subpath: string): string => subpath.replaceAll('-', '_')
const topName = (subpath: string): string =>
  subpath
    .split('-')
    .map((word) => `${word.slice(0, 1).toUpperCase()}${word.slice(1)}`)
    .join('')

const accessor = (subpath: string, part: string): string =>
  part === '.' ? topName(subpath) : `${topName(subpath)}.${part}`

export const EQUAL =
  'type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false\n' +
  'type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false\n' +
  'type Assert<T extends true> = T\n' +
  "type Variants = { variant?: 'secondary' | 'primary' | 'ghost'; size?: 'md' | 'sm' }\n" +
  "type Sizes = { size?: 'md' | 'sm' }\n"

const GENERIC_ARGUMENT: Readonly<Record<string, string>> = {
  'accordion.Root': "'a' | 'b'",
  'combobox.Root': 'string',
  'navigation-menu.Root': 'string',
  'radio-group..': "'a' | 'b'",
  'slider.Root': 'number',
  'toggle-group..': "'a' | 'b'",
}

const importsFor = (subpaths: readonly SubpathTypes[]): string[] =>
  subpaths.flatMap(({ subpath }) => [
    `import * as N_${identifier(subpath)} from '${NAVE}/${subpath}'`,
    `import * as B_${identifier(subpath)} from '${BASE}/${subpath}'`,
  ])

export const typeOf = (side: 'B' | 'N', subpath: string, part: string): string =>
  `typeof ${side}_${identifier(subpath)}.${accessor(subpath, part)}`

const variantAssertions = (subpaths: readonly SubpathTypes[]): string[] =>
  VARIANT_PARTS.flatMap(({ kind, part, subpath }) => {
    const installed = subpaths
      .find((entry) => entry.subpath === subpath)
      ?.parts.find((p) => p.name === part)
    const isGeneric = (installed?.callTypeParameters.length ?? 0) > 0
    const [n, b] = [typeOf('N', subpath, part), typeOf('B', subpath, part)]
    const [nProps, bProps] = isGeneric
      ? [`Parameters<${n}<string>>[0]`, `Parameters<${b}<string>>[0]`]
      : [`Parameters<${n}>[0]`, `Parameters<${b}>[0]`]
    const added = kind === 'variant' ? 'Variants' : 'Sizes'
    const id = `${identifier(subpath)}_${part === '.' ? 'self' : part}`
    // Equal as types are in use: each assignable to the other, with the same property names, and
    // leaving `ref` out. Base UI types a trigger's `ref` as the intersection of its own element and
    // `HTMLElement`; the wrapper accepts a ref to the element the part declares, which is the same
    // ref to a consumer, so `ref` is held by its own assertion below.
    const [left, right] = [`Omit<${nProps}, 'ref'>`, `Omit<${bProps} & ${added}, 'ref'>`]
    return [
      `export type V_${id} = Assert<Same<${left}, ${right}>>`,
      `export type N_${id} = Assert<Equal<keyof ${left}, keyof ${right}>>`,
      `export type K_${id} = Assert<Equal<Extract<keyof ${bProps}, 'variant' | 'size'>, never>>`,
    ]
  })

const refAssertions = (subpaths: readonly SubpathTypes[]): string[] =>
  VARIANT_PARTS.map(({ part, subpath }) => {
    const installed = subpaths
      .find((entry) => entry.subpath === subpath)
      ?.parts.find((p) => p.name === part)
    const n = typeOf('N', subpath, part)
    const props =
      (installed?.callTypeParameters.length ?? 0) > 0
        ? `Parameters<${n}<string>>[0]`
        : `Parameters<${n}>[0]`
    return `export const ref_${identifier(subpath)}_${part === '.' ? 'self' : part}: ${props} = { ref: createRef<HTMLButtonElement>() }`
  })

const equalityAssertions = (subpaths: readonly SubpathTypes[]): string[] =>
  subpaths.flatMap(({ parts, subpath }) =>
    parts
      .filter(
        (part) =>
          !isTypedApart(subpath, part.name) && !isLeftOut(`${topName(subpath)}.${part.name}`),
      )
      .map(
        (part) =>
          `export type E_${identifier(subpath)}_${part.name === '.' ? 'self' : part.name} = Assert<Equal<${typeOf('N', subpath, part.name)}, ${typeOf('B', subpath, part.name)}>>`,
      ),
  )

const genericAssertions = (subpaths: readonly SubpathTypes[]): string[] =>
  Object.entries(GENERIC_ARGUMENT).flatMap(([key, argument]) => {
    const [subpath = '', part = ''] = key.split('.', 2)
    const partName = part === '' ? '.' : part
    const installed = subpaths
      .find((entry) => entry.subpath === subpath)
      ?.parts.find((p) => p.name === partName)
    if ((installed?.callTypeParameters.length ?? 0) === 0) {
      return []
    }
    const [n, b] = [typeOf('N', subpath, partName), typeOf('B', subpath, partName)]
    return [
      `export type G_${identifier(subpath)}_${part === '' ? 'self' : part} = Assert<Equal<Parameters<${n}<${argument}>>[0], Parameters<${b}<${argument}>>[0]>>`,
    ]
  })

/**
AC-base-ui-overlay-completion-03's assertions: every part outside the Button family is typed as the Base UI part, read from its
own namespace, and a generic root keeps its type parameters.
 */
export const equalityFixture = (subpaths: readonly SubpathTypes[]): string =>
  [
    ...importsFor(subpaths),
    EQUAL,
    ...equalityAssertions(subpaths),
    ...genericAssertions(subpaths),
    ...menubarAssertions(),
  ].join('\n')

/**
AC-base-ui-overlay-completion-05's assertions: each Button-family part's props are the Base UI part's props plus exactly the
variant and size props it gains, and Base UI's own props name neither.
 */
export const variantFixture = (subpaths: readonly SubpathTypes[]): string =>
  [...importsFor(subpaths), EQUAL, ...variantAssertions(subpaths)].join('\n')

/**
The `Menubar` component is one export, and its `Props` and `State` resolve through the wrapper as
they do through Base UI.
 */
const menubarAssertions = (): string[] => [
  'export type M_Props = Assert<Equal<N_menubar.Menubar.Props, B_menubar.Menubar.Props>>',
  'export type M_State = Assert<Equal<N_menubar.Menubar.State, B_menubar.Menubar.State>>',
]

/**
Every Button-family part renders a button, so each one's props must accept a ref to a button.
 */
export const refFixture = (subpaths: readonly SubpathTypes[]): string =>
  ["import { createRef } from 'react'", ...importsFor(subpaths), ...refAssertions(subpaths)].join(
    '\n',
  )

export interface TscResult {
  readonly code: number
  readonly output: string
}

const CACHE = path.join(PACKAGE_DIR, 'node_modules/.cache/type-fixtures')

/**
Compiles the files with the package's `tsc`, resolving this package to its built `dist/` and Base
UI to the version asked for.
 */
export const compile = async (
  name: string,
  files: Readonly<Record<string, string>>,
  version: BaseUiVersion,
): Promise<TscResult> => {
  const directory = path.join(CACHE, name)
  mkdirSync(directory, { recursive: true })
  for (const [file, text] of Object.entries(files)) {
    writeFileSync(path.join(directory, file), text)
  }
  const dist = path.join(PACKAGE_DIR, 'dist')
  const floor = path.join(PACKAGE_DIR, 'node_modules/base-ui-react-floor/esm')
  const paths: Record<string, string[]> = {
    [NAVE]: [path.join(dist, 'index.d.ts')],
    [`${NAVE}/*`]: [path.join(dist, '*/index.d.ts')],
    ...(version === 'floor' && {
      [BASE]: [path.join(floor, 'index.d.ts')],
      [`${BASE}/*`]: [path.join(floor, '*/index.d.ts')],
    }),
  }
  writeFileSync(
    path.join(directory, 'tsconfig.json'),
    JSON.stringify({
      compilerOptions: {
        jsx: 'react-jsx',
        lib: ['ES2022', 'DOM'],
        module: 'ESNext',
        moduleResolution: 'Bundler',
        noEmit: true,
        paths,
        skipLibCheck: false,
        strict: true,
        target: 'ES2022',
        types: [],
      },
      files: Object.keys(files),
    }),
  )
  try {
    const { stdout } = await run(
      process.execPath,
      [path.join(PACKAGE_DIR, 'node_modules/typescript/bin/tsc'), '-p', directory],
      { maxBuffer: 20_000_000 },
    )
    return { code: 0, output: stdout }
  } catch (error) {
    const failure = error as { code?: number; stdout?: string }
    return { code: failure.code ?? 1, output: failure.stdout ?? String(error) }
  }
}
