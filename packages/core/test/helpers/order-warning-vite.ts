/**
 * Fixtures for the order warning through the Vite plugin: a scratch Vite project built by the
 * `vite build` command from a config file (the plugin is the built package), with a probe plugin
 * that says which environments transformed a stylesheet, and the warning texts of a stylesheet as
 * the text expander gives them.
 */
import type { ScratchApp } from './vite-app.ts'

import { expandText } from '../../src/directive/expand-text.ts'
import { appFiles, makeUsedApp } from './used-atoms-app.ts'

export const FLOOR_KEYS = `
  build: { cssTarget: ['chrome125', 'edge125', 'firefox128', 'safari18', 'ios18'] },
  css: {
    transformer: 'lightningcss',
    lightningcss: { targets: { chrome: 125 << 16, edge: 125 << 16, firefox: 128 << 16, safari: 18 << 16, ios_saf: 18 << 16 } },
  },`

export const LIGHTNING_DEFAULT_TARGETS = "  css: { transformer: 'lightningcss' },"

export interface OrderProject {
  /**
   * The argument of `navePlugin(...)`, as text.
   */
  readonly options?: string
  /**
   * Config keys as text; the default is the documented floor under the default transformer.
   */
  readonly keys?: string
  /**
   * Stylesheets by path, imported by both environments.
   */
  readonly sheets: Readonly<Record<string, string>>
}

/**
 * A project with a client and an ssr environment that both import every stylesheet, built in the
 * order client then ssr.
 */
export function orderProject(project: OrderProject): ScratchApp {
  const imports = Object.keys(project.sheets).map(
    (name) => `import './${name.replace(/^src\//, '')}'`,
  )
  const config = `import { navePlugin } from '@navecss/core/vite'

const probe = {
  name: 'probe',
  transform(_code, id) {
    if (/\\.(?:css|scss)(?:\\?|$)/.test(id) && !id.includes('app.css')) console.log('probe transform ' + (this.environment?.name ?? 'client'))
  },
}

export default {
  plugins: [navePlugin(${project.options ?? ''}), probe],${project.keys ?? "\n  build: { cssTarget: ['chrome125', 'edge125', 'firefox128', 'safari18', 'ios18'] },"}
  environments: { ssr: { build: { outDir: 'dist-ssr', rolldownOptions: { input: 'src/entry-server.tsx' } } } },
  builder: {
    async buildApp(builder) {
      for (const name of ['client', 'ssr']) await builder.build(builder.environments[name])
    },
  },
}
`
  return makeUsedApp({
    ...appFiles(
      {
        'src/main.tsx': `${imports.join('\n')}\nconsole.log(1)\n`,
        'src/entry-server.tsx': `${imports.join('\n')}\nexport const s = 1\n`,
        'src/app.css': 'body { margin: 0 }\n',
        ...project.sheets,
      },
      ['src/main.tsx'],
    ),
    'vite.config.mjs': config,
  })
}

/**
 * The warning texts the text expander gives `css`, in source order.
 */
export function warningTextsOf(css: string): string[] {
  return expandText(css).warnings.map((warning) => warning.text)
}

/**
 * How many times `text` occurs in `output`.
 */
export function occurrences(output: string, text: string): number {
  return output.split(text).length - 1
}
