/**
 * The used-atoms criterion for frameworks (AC-used-atoms-06): Vue templates as
 * `@vitejs/plugin-vue` compiles them in a build, a build that keeps the template apart, and the
 * dev server; and Svelte.
 */
import { svelte } from '@sveltejs/vite-plugin-svelte'
import vuePlugin from '@vitejs/plugin-vue'
import type { PluginOption } from 'vite'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { navePlugin } from '../src/vite.ts'
import { collectedAtoms, stateFor } from '../src/vite-state.ts'
import {
  appFiles,
  atomLayerAtoms,
  atoms,
  buildUsed,
  makeUsedApp,
} from './helpers/used-atoms-app.ts'
import { appConfig, startDev } from './helpers/vite-app.ts'

const SCRIPT = `<script setup lang="ts">
import { cx } from '@navecss/core/cx'
const props = defineProps<{ on: boolean }>()
const v = 'grid'
</script>
`
const TEMPLATE = `<div :class="cx('flex', props.on && 'itemsCenter', v)"><span :class="cx.raw('legacy')" /></div>`
const FILES = {
  'src/Card.vue': `${SCRIPT}<template>${TEMPLATE}</template>\n`,
  'src/card.html': `<div :class="cx('flex', props.on && 'itemsCenter', v, 'justifyEnd')" />`,
  'src/CardSrc.vue': `${SCRIPT}<template src="./card.html"></template>\n`,
  'src/Opts.vue': `<script>
import { cx } from '@navecss/core/cx'
export default { setup() { return { cls: cx('gap') } } }
</script>
<template><div :class="cls" /></template>
`,
  'src/unref.ts':
    "import { unref as u } from 'vue'\nimport { cx } from '@navecss/core/cx'\nexport const x = u(cx)('block')\nconsole.log(x)\n",
  'src/Tag.svelte': `<script>
  import { cx } from '@navecss/core/cx'
  let { on } = $props()
</script>
<div class={cx('flex', on && 'truncate')}>t</div>
`,
  'src/vue-main.ts':
    "import Card from './Card.vue'\nimport CardSrc from './CardSrc.vue'\nimport Opts from './Opts.vue'\nimport './unref.ts'\nconsole.log(Card, CardSrc, Opts)\n",
}
const ALL = atoms('flex', 'itemsCenter', 'grid', 'gap', 'block', 'truncate', 'justifyEnd')

/**
 * Records the module text the post-order half is given, by module id.
 */
function recorder(seen: Map<string, string>): PluginOption {
  return {
    name: 'record-post-order',
    enforce: 'post',
    transform(code, id) {
      seen.set(id.replace(/^.*\/src\//, 'src/'), code)
    },
  }
}

describe('AC-used-atoms-06 — Vue templates as plugin-vue compiles them, and Svelte', () => {
  let previous: string | undefined
  beforeAll(() => {
    previous = process.env.NODE_ENV
  })
  afterAll(() => {
    if (previous === undefined) delete process.env.NODE_ENV
    else process.env.NODE_ENV = previous
  })

  it('(a) builds with defaults, the templates inlined into setup()', async () => {
    process.env.NODE_ENV = 'production'
    const app = makeUsedApp(appFiles(FILES, ['src/vue-main.ts', 'src/Tag.svelte']))
    const seen = new Map<string, string>()
    try {
      const built = await buildUsed(app, { plugins: [vuePlugin(), svelte(), recorder(seen)] })

      expect(built.error).toBeUndefined()
      expect(atomLayerAtoms(built.css)).toEqual(ALL)
      expect(
        [...seen].find(([id]) => id.startsWith('src/Card.vue?vue&type=script'))?.[1],
      ).toContain('_unref(cx)(')
    } finally {
      app.dispose()
    }
  }, 120_000)

  it('(b) builds with production devtools, the template compiled apart from setup()', async () => {
    process.env.NODE_ENV = 'production'
    const app = makeUsedApp(appFiles(FILES, ['src/vue-main.ts', 'src/Tag.svelte']))
    const seen = new Map<string, string>()
    try {
      const built = await buildUsed(app, {
        plugins: [vuePlugin(), svelte(), recorder(seen)],
        config: { define: { __VUE_PROD_DEVTOOLS__: 'true' } },
      })

      expect(built.error).toBeUndefined()
      expect(atomLayerAtoms(built.css)).toEqual(ALL)
      expect(seen.get('src/Card.vue')).toContain('$setup.cx(')
      expect(
        [...seen].find(([id]) => id.startsWith('src/Card.vue?vue&type=script'))?.[1],
      ).toContain('get cx()')
    } finally {
      app.dispose()
    }
  }, 120_000)

  it('(c) serves every component in dev with no error, and collects the atoms their calls name', async () => {
    process.env.NODE_ENV = 'development'
    const app = makeUsedApp(appFiles(FILES, ['src/vue-main.ts', 'src/Tag.svelte']))
    const seen = new Map<string, string>()
    let resolved: object | undefined
    const capture: PluginOption = {
      name: 'capture-config',
      configResolved(config) {
        resolved = config
      },
    }
    try {
      const server = await startDev(
        appConfig(app.root, 'postcss', [
          vuePlugin(),
          svelte(),
          navePlugin(),
          capture,
          recorder(seen),
        ]),
      )
      try {
        for (const file of ['Card.vue', 'CardSrc.vue', 'Opts.vue', 'unref.ts', 'Tag.svelte']) {
          await expect(server.transformRequest(`/src/${file}`)).resolves.toBeTruthy()
        }
      } finally {
        await server.close()
      }
      expect(seen.get('src/Card.vue')).toContain('$setup.cx(')
      // Card.vue's calls are in its template, which dev compiles into the module that returns the
      // setup, so reading them is what puts `flex`, `itemsCenter` and `grid` in the set.
      const collected = collectedAtoms(stateFor(app.root, resolved!), [])
      for (const atom of ['flex', 'itemsCenter', 'grid', 'gap', 'block', 'truncate']) {
        expect(collected.has(atom), atom).toBe(true)
      }
    } finally {
      app.dispose()
    }
  }, 120_000)

  it('refuses a template call whose argument is a prop, at the template’s authored line', async () => {
    process.env.NODE_ENV = 'production'
    const bad = `${SCRIPT.replace("const v = 'grid'", "const v = 'grid'\n")}<template><div :class="cx(props.variant)" /></template>\n`
    for (const define of [{}, { __VUE_PROD_DEVTOOLS__: 'true' }]) {
      const app = makeUsedApp(
        appFiles({ 'src/Bad.vue': bad.replace('on: boolean', 'variant: string') }, ['src/Bad.vue']),
      )
      try {
        // plugin-vue hands over a source map only when the build asks for maps, so this row does.
        const built = await buildUsed(app, {
          plugins: [vuePlugin()],
          build: { sourcemap: true },
          config: { define },
        })

        expect(built.error).toMatch(/^1 problem in 1 file/)
        expect(built.error).toContain('src/Bad.vue:7:')
        expect(built.error).toContain('cx(props.variant): the argument is not a literal atom name.')
      } finally {
        app.dispose()
      }
    }
  }, 120_000)
})
