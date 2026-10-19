import type { NavePluginOptions } from '@navecss/core/postcss'
/**
 * Fixtures the plugin tests share: project files, the lines the plugin prints, and core's own
 * answer for a stylesheet, which the plugin's answers are compared with.
 */
import type { CssSyntaxError } from 'postcss'

import { navePlugin } from '@navecss/core/postcss'
import path from 'node:path'
import postcss from 'postcss'
import { afterEach, beforeEach, vi } from 'vitest'

import type { Project } from './project.ts'

import { createProject } from './project.ts'

const projects: Project[] = []

/**
 * Creates a scratch project that the registered cleanup removes.
 */
export function makeProject(files: Record<string, string> = {}): Project {
  const project = createProject(files)
  projects.push(project)
  return project
}

/**
 * Registers the hooks every plugin test file needs: no `NEXT_COMPILER_NAME` in the environment
 * unless a test sets it, and, after each test, restored spies and environment and removed projects.
 */
export function registerIsolation(): void {
  beforeEach(() => {
    vi.stubEnv('NEXT_COMPILER_NAME', undefined)
  })
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllEnvs()
    for (const project of projects) project.remove()
    projects.length = 0
  })
}

/**
 * Starts collecting what the code prints through `console.warn`, `console.error` and
 * `console.log`, and returns a function that reads the non-empty lines printed so far, across all
 * three.
 */
export function capturePrinted(): () => string[] {
  const printed: string[] = []
  const collect = (...args: unknown[]): void => {
    const lines = args.map(String).join(' ').split('\n')
    for (const line of lines) {
      if (line.trim() !== '') printed.push(line)
    }
  }
  vi.spyOn(console, 'warn').mockImplementation(collect)
  vi.spyOn(console, 'error').mockImplementation(collect)
  vi.spyOn(console, 'log').mockImplementation(collect)
  return () => [...printed]
}

const CX_IMPORT = "import { cx } from '@navecss/core/cx'"

/**
 * A page module whose component returns an element with `className={cx(<argument>)}`.
 */
export function pageCalling(argument: string): string {
  return `${CX_IMPORT}\n\nexport default function Page() {\n  return <div className={cx(${argument})} />\n}\n`
}

/**
 * A page module whose `cx` argument is a prop, so the argument cannot be read. The call is on
 * line 4.
 */
export const PAGE_WITH_PROP = `${CX_IMPORT}

export default function Page({ variant }: { variant: string }) {
  return <div className={cx(variant)} />
}
`

/**
 * An installed package that calls `cx` with an argument it cannot read, and whose `package.json`
 * lists `@navecss/core` in `dependencies`.
 */
export function unreadableLibrary(): Record<string, string> {
  return {
    'package.json': JSON.stringify({
      name: 'kf-lib',
      version: '1.0.0',
      type: 'module',
      main: 'index.js',
      dependencies: { '@navecss/core': '*' },
    }),
    'index.js': `${CX_IMPORT}\n\nexport const look = (v) => cx(v)\n`,
  }
}

/**
 * The text core's PostCSS plugin throws for `css`, without its position prefix, with the position
 * it names. Fails when core does not throw or when its message does not have the expected shape.
 */
export async function coreThrown(
  css: string,
  file: string,
  options: NavePluginOptions = {},
): Promise<{ readonly column: number; readonly line: number; readonly text: string }> {
  try {
    await postcss([navePlugin(options)]).process(css, { from: file })
  } catch (error) {
    const { message, line, column } = error as CssSyntaxError & { column: number; line: number }
    const prefix = `postcss-nave: ${file}:${line}:${column}: `
    if (!message.startsWith(prefix))
      throw new Error(`unexpected message from core: ${message}`, { cause: error })
    return { text: message.slice(prefix.length), line, column }
  }
  throw new Error('core did not throw')
}

/**
 * The stylesheet core's PostCSS plugin produces from `css`.
 */
export async function coreOutput(css: string, file: string): Promise<string> {
  const result = await postcss([navePlugin()]).process(css, { from: file })
  return result.css
}

/**
 * The absolute path of a project file.
 */
export function inProject(project: Project, file: string): string {
  return path.join(project.dir, file)
}
