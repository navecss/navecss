/**
 * Compiling the copies as a consumer would: the TypeScript compiler API, in this process, over the
 * `tsconfig.app.json` that `create-vite`'s `react-ts` template writes (recorded in
 * `test/fixtures/registry/tsconfig.app.json`), with `skipLibCheck` off, `vite/client` types, and Base
 * UI at the floor or at the devDependency version.
 */
/* eslint-disable import-x/no-named-as-default-member -- TypeScript is CommonJS, and its default export is the one form Node's ESM loader gives every member of */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import ts from 'typescript'

import type { RegistryItem } from './load.ts'

import { PACKAGE_DIR } from '../stylesheet.ts'

export type BaseUiVersion = 'current' | 'floor'

export const TEMPLATE_TSCONFIG = path.join(PACKAGE_DIR, 'test/fixtures/registry/tsconfig.app.json')

const DIST = path.join(PACKAGE_DIR, 'dist')
const FLOOR = path.join(PACKAGE_DIR, 'node_modules/base-ui-react-floor/esm')

export interface TemplateConfig {
  compilerOptions: Record<string, unknown>
  include: string[]
}

export const readTemplate = (): TemplateConfig =>
  JSON.parse(readFileSync(TEMPLATE_TSCONFIG, 'utf8')) as TemplateConfig

/**
 * Where `@navecss/base-ui/<subpath>` and, at the floor, `@base-ui/react/<subpath>` resolve to.
 */
const pathsFor = (version: BaseUiVersion): Record<string, string[]> => ({
  '@navecss/base-ui': [path.join(DIST, 'index.d.ts')],
  '@navecss/base-ui/*': [path.join(DIST, '*/index.d.ts')],
  ...(version === 'floor' && {
    '@base-ui/react': [path.join(FLOOR, 'index.d.ts')],
    '@base-ui/react/*': [path.join(FLOOR, '*/index.d.ts')],
  }),
})

/**
 * The template's options, as the consumer's `tsc` reads them, with `skipLibCheck` turned off.
 */
const parsedConfig = (directory: string, version: BaseUiVersion): ts.ParsedCommandLine => {
  const template = readTemplate()
  const config = {
    ...template,
    compilerOptions: { ...template.compilerOptions, paths: pathsFor(version), skipLibCheck: false },
  }
  return ts.parseJsonConfigFileContent(
    config,
    ts.sys,
    directory,
    undefined,
    path.join(directory, 'tsconfig.app.json'),
  )
}

export interface Problem {
  readonly code: number
  /**
  The file's path relative to the scratch directory, or `undefined` for an error that has none.
   */
  readonly file: string | undefined
  /**
  The 1-based line in that file.
   */
  readonly line: number | undefined
  readonly text: string
}

const toProblem = (directory: string, diagnostic: ts.Diagnostic): Problem => {
  const text = ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n')
  const { file, start } = diagnostic
  if (file === undefined) return { code: diagnostic.code, file: undefined, line: undefined, text }
  const at = file.getLineAndCharacterOfPosition(start ?? 0)
  const relative = path.relative(directory, file.fileName)
  return {
    code: diagnostic.code,
    file: relative,
    line: at.line + 1,
    text: `${relative}(${at.line + 1},${at.character + 1}): ${text}`,
  }
}

export const describeProblem = ({ code, file, text }: Problem): string =>
  `${file === undefined ? '(no file)' : ''} error TS${code}: ${text}`.trim()

/**
 * Writes the given files under `<directory>/src` and makes the program `tsc --noEmit -p
 * tsconfig.app.json` would, in this process.
 */
export const buildProgram = (
  directory: string,
  version: BaseUiVersion,
  files: Readonly<Record<string, string>>,
): ts.Program => {
  const source = path.join(directory, 'src')
  mkdirSync(source, { recursive: true })
  for (const [name, text] of Object.entries(files)) writeFileSync(path.join(source, name), text)
  const parsed = parsedConfig(directory, version)
  return ts.createProgram({ options: parsed.options, rootNames: parsed.fileNames })
}

/**
 * The errors of a compile of the given files, as `tsc --noEmit` would print them.
 */
export const compileSources = (
  directory: string,
  version: BaseUiVersion,
  files: Readonly<Record<string, string>>,
): Problem[] => {
  const program = buildProgram(directory, version, files)
  return [...parsedConfig(directory, version).errors, ...ts.getPreEmitDiagnostics(program)].map(
    (diagnostic) => toProblem(directory, diagnostic),
  )
}

/**
 * Every item's files, by base name, as the text a consumer's directory would hold.
 */
export const sourcesOf = (items: Iterable<RegistryItem>): Record<string, string> =>
  Object.fromEntries(
    [...items].flatMap((item) =>
      item.files.map((file) => [path.posix.basename(file.target), file.content ?? ''] as const),
    ),
  )

export const describeProblems = (problems: readonly Problem[]): string[] =>
  problems.map((problem) => describeProblem(problem))
