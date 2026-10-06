/**
 * The TypeScript the type instruments compile, written from what the installed Base UI declares
 * and run through `tsc` against the built package: a fixture that names, for every subpath, every
 * type Base UI exports and every part's type namespace (AC-02), and the assertions about the
 * wrapped parts' types (AC-15).
 */
import { execFile } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { promisify } from 'node:util'

import type { BaseUiVersion, SubpathTypes } from '../../scripts/wrappers/read-types.ts'

import { PACKAGE_DIR } from './stylesheet.ts'

const run = promisify(execFile)

const BASE = '@base-ui/react'
const NAVE = '@navecss/base-ui'

/**
The parts whose props gain `variant` and `size` (R4), by subpath and part (`.` for the component).
 */
export const VARIANT_PARTS: readonly { kind: 'size' | 'variant'; part: string; subpath: string }[] =
  [
    { kind: 'variant', part: '.', subpath: 'button' },
    { kind: 'variant', part: 'Button', subpath: 'toolbar' },
    { kind: 'variant', part: 'Trigger', subpath: 'dialog' },
    { kind: 'variant', part: 'Close', subpath: 'dialog' },
    { kind: 'variant', part: 'Trigger', subpath: 'popover' },
    { kind: 'variant', part: 'Close', subpath: 'popover' },
    { kind: 'variant', part: 'Trigger', subpath: 'menu' },
    { kind: 'variant', part: 'Trigger', subpath: 'tooltip' },
    { kind: 'size', part: '.', subpath: 'toggle' },
  ]

const isVariantPart = (subpath: string, part: string): boolean =>
  VARIANT_PARTS.some((entry) => entry.subpath === subpath && entry.part === part)

const identifier = (subpath: string): string => subpath.replaceAll('-', '_')
const topName = (subpath: string): string =>
  subpath
    .split('-')
    .map((word) => `${word.slice(0, 1).toUpperCase()}${word.slice(1)}`)
    .join('')

const accessor = (subpath: string, part: string): string =>
  part === '.' ? topName(subpath) : `${topName(subpath)}.${part}`

/**
AC-02's fixture: imports every type-only export of every subpath and references every part's
namespace members, importing from `from` (Base UI's own specifier, or this package's).
 */
export const referenceFixture = (
  subpaths: readonly SubpathTypes[],
  from: typeof BASE | typeof NAVE,
): string =>
  subpaths
    .flatMap(({ flatTypes, parts, subpath }) => [
      `export type { ${flatTypes.join(', ')} } from '${from}/${subpath}'`,
      `import { ${topName(subpath)} as C_${identifier(subpath)} } from '${from}/${subpath}'`,
      ...parts.flatMap((part) =>
        part.members.map(({ name: member, parameters }) => {
          const arity = parameters.filter((parameter) => !parameter.includes('=')).length
          const args =
            arity === 0 ? '' : `<${Array.from({ length: arity }, () => 'any').join(', ')}>`
          return `export type R_${identifier(subpath)}_${part.name === '.' ? 'self' : part.name}_${member} = C_${identifier(subpath)}${part.name === '.' ? '' : `.${part.name}`}.${member}${args}`
        }),
      ),
    ])
    .join('\n')

const EQUAL =
  'type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false\n' +
  'type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false\n' +
  'type Assert<T extends true> = T\n' +
  "type Variants = { variant?: 'secondary' | 'primary'; size?: 'md' | 'sm' }\n" +
  "type Sizes = { size?: 'md' | 'sm' }\n"

const GENERIC_ARGUMENT: Readonly<Record<string, string>> = {
  'accordion.Root': "'a' | 'b'",
  'radio-group..': "'a' | 'b'",
  'slider.Root': 'number',
  'toggle-group..': "'a' | 'b'",
}

const importsFor = (subpaths: readonly SubpathTypes[]): string[] =>
  subpaths.flatMap(({ subpath }) => [
    `import * as N_${identifier(subpath)} from '${NAVE}/${subpath}'`,
    `import * as B_${identifier(subpath)} from '${BASE}/${subpath}'`,
  ])

const typeOf = (side: 'B' | 'N', subpath: string, part: string): string =>
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
      .filter((part) => !isVariantPart(subpath, part.name))
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
AC-15's assertions about the wrapped parts' types, for the Base UI the subpaths were read from.
 */
export const assertionFixture = (subpaths: readonly SubpathTypes[]): string =>
  [
    ...importsFor(subpaths),
    EQUAL,
    ...equalityAssertions(subpaths),
    ...variantAssertions(subpaths),
    ...genericAssertions(subpaths),
  ].join('\n')

/**
Every Button-family part renders a button, so each one's props must accept a ref to a button.
 */
export const refFixture = (subpaths: readonly SubpathTypes[]): string =>
  ["import { createRef } from 'react'", ...importsFor(subpaths), ...refAssertions(subpaths)].join(
    '\n',
  )

/**
The three type errors AC-15 requires, as source: a size and a variant outside the unions, and a
`variant` on a Toggle. They are compiled against both Base UI versions.
 */
export const REJECTED_PROPS = `
import * as Button from '${NAVE}/button'
import * as Toggle from '${NAVE}/toggle'
type ButtonProps = Parameters<typeof Button.Button>[0]
type ToggleProps = Parameters<typeof Toggle.Toggle>[0]
// @ts-expect-error size lg is not a size
export const lg: ButtonProps = { size: 'lg' }
// @ts-expect-error variant ghost is not a variant
export const ghost: ButtonProps = { variant: 'ghost' }
// @ts-expect-error a Toggle takes a size only
export const toggleVariant: ToggleProps = { variant: 'primary' }
export const accepted: ButtonProps = { variant: 'primary', size: 'sm' }
`

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
