/**
 * The pieces the used-atoms rows for `keepFor` share: a build of a scratch app over dependency
 * packages, and the line the build prints for a listed package whose `cx` export the application
 * takes.
 */
import {
  addPackage,
  appFiles,
  type BuildOptions,
  buildUsed,
  type Built,
  makeUsedApp,
} from './used-atoms-app.ts'
import { IMPORT } from './used-atoms-rows.ts'

export const KEEP_FLEX = { '@acme/ui': ['flex'] } as const
export const KEEP_NONE = { '@acme/ui': [] } as const
export const WHOLE =
  '; where a file takes a module of the package whole (a namespace import, export *, import() or an import the build cannot read), import by name what it uses from the package, and cx from @navecss/core/cx'
export const FIX =
  " The lasting fix is the package's: import cx from @navecss/core/cx where it is called, and re-export it from there, only under the name cx, in each module that gives it out."

/**
 * The remedy line for a listed package whose `cx` export the application takes: `listed` is the
 * list of takers and what each takes, `files` the clause that points at them, `whole` the clause
 * for a take of a module whole and `fix` the closing sentence for a package that has one to make.
 */
export function takenLine(listed: string, files = 'in that file', whole = '', fix = FIX): string {
  const pkg = '@acme/ui'
  return `${pkg} re-exports cx, and your code takes it from the package in ${listed}. The build does not read calls made through what your code takes there, and the keepFor entry stands in only for the package's own calls: ${files}, import cx from @navecss/core/cx instead and call cx in its place${whole}. No cxModules entry clears this: the build reads cx through a listed module only where your code takes it, by an import the build can read, from a module that re-exports it from @navecss/core/cx itself and only under the name cx, and none of these takes is one. Once your code makes none of these takes, the keepFor entry clears this.${fix}`
}

interface Scenario {
  readonly app: Record<string, string>
  readonly code: string
  readonly config?: (root: string) => Record<string, unknown>
  readonly options: NonNullable<BuildOptions['options']>
  readonly packages: Record<string, Record<string, string>>
}

/**
 * Builds the scenario's scratch app: `code` as `src/App.ts`, the `app` files beside it, and the
 * `packages` in `node_modules`, `@acme/ui` among them. `config` is given the project root and its
 * result is merged over the fixture's Vite config.
 */
async function build(scenario: Scenario): Promise<Built> {
  const { app, code, config, options, packages } = scenario
  const scratch = makeUsedApp(appFiles({ 'src/App.ts': code, ...app }))
  for (const [name, files] of Object.entries(packages)) addPackage(scratch, name, files)
  try {
    return await buildUsed(scratch, { options, ...(config && { config: config(scratch.root) }) })
  } finally {
    scratch.dispose()
  }
}

/**
 * Builds an app of `code` (`src/App.ts`, with more `app` files beside it) over the packages of
 * `packages`, `@acme/ui` among them.
 */
export function run(
  code: string,
  packages: Record<string, Record<string, string>>,
  options: BuildOptions['options'] = {},
  app: Record<string, string> = {},
): Promise<Built> {
  return build({ app, code, options, packages })
}

/**
 * Builds the same app with `config`, which is given the project root, merged over the fixture's
 * Vite config.
 */
export function runWithConfig(
  config: (root: string) => Record<string, unknown>,
  code: string,
  packages: Record<string, Record<string, string>>,
  options: BuildOptions['options'] = {},
): Promise<Built> {
  return build({ app: {}, code, config, options, packages })
}

/**
 * A package whose entry exports `Menu`, which calls `cx('flex', v)` and imports `file`, holding
 * `text`, for its effect.
 */
export function withMenu(file: string, text: string): Record<string, string> {
  return {
    'index.js': "export { Menu } from './menu.js'\n",
    'menu.js': `${IMPORT}import './${file}'\nexport const Menu = (v) => cx('flex', v)\n`,
    [file]: text,
  }
}

export const NAVE_APP =
  "import { cx } from '@navecss/core/cx'\nimport { Menu } from '@acme/ui'\nexport const A = [Menu, cx('block')]\n"
