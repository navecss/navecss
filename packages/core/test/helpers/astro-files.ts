/* eslint-disable unicorn/no-incorrect-template-string-interpolation -- the fixtures are source text: `{root}` and `{fm}` are JSX and Astro attribute braces in it, not a mistyped interpolation */
/**
 * The source files of the scratch Astro project (`astro-app.ts`): a layout whose first `<head>`
 * child is the README's `<style is:inline>` line, pages, React islands, and the extra files the
 * server, prerendered, lean and no-rename rows add.
 */
import { orderStatementLine } from './astro-readme.ts'

/**
 * The Quick start's stylesheet, then the one rule the fixture's `@nave` use sits in.
 */
const APP_CSS = `@import url('@navecss/core/layers');
@import url('@navecss/core');

.card {
  @nave breakWord;
}
`

/**
 * A React island that sets `data-hydrated` on its root in an effect and applies `atom`.
 */
function island(name: string, atom: string, extra = ''): string {
  return `import { useEffect, useRef } from 'react'
import { cx } from '@navecss/core/cx'
${extra}
export default function ${name}() {
  const root = useRef<HTMLDivElement>(null)
  useEffect(() => {
    root.current?.setAttribute('data-hydrated', '')
  }, [])
  return (
    <div ref={root} id="${name.toLowerCase()}" className={cx('${atom}')}>
      ${name}
    </div>
  )
}
`
}

const ONLY_ISLAND = `import { useEffect, useRef } from 'react'
import { cx } from '@navecss/core/cx'

export default function OnlyIsland() {
  const root = useRef<HTMLDivElement>(null)
  useEffect(() => {
    root.current?.setAttribute('data-hydrated', '')
    void import('../lib/lazy.ts').then(({ cls }) => {
      document.getElementById('lazy')?.setAttribute('class', cls())
    })
  }, [])
  return (
    <div ref={root} id="onlyisland" className={cx('inlineFlex')}>
      OnlyIsland
    </div>
  )
}
`

const LAZY = `import { cx } from '@navecss/core/cx'

export const cls = () => cx('wFull')
`

/**
 * The layout: the README's order statement first in the head, then an optional extra head child
 * (`<ClientRouter />`), then the stylesheet import.
 */
export function layout(head = '', frontmatter = ''): string {
  return `---
import '../styles/app.css'
${frontmatter}---
<html lang="en">
  <head>
    ${orderStatementLine()}
    <meta charset="utf-8" />
    <title>fixture</title>
    ${head}
  </head>
  <body><slot /></body>
</html>
`
}

const INDEX = `---
import { cx } from '@navecss/core/cx'
import Layout from '../layouts/Layout.astro'
import Load from '../components/Load.tsx'
import Idle from '../components/Idle.tsx'
import Media from '../components/Media.tsx'
import Visible from '../components/Visible.tsx'
import OnlyIsland from '../components/OnlyIsland.tsx'

const fm = cx('block')
---
<Layout>
  <p id="fm" class={fm}>fm</p>
  <div id="t" class={cx('flex')}>t</div>
  <p id="raw" class="nave-text-center">raw</p>
  <div id="card" class="card">card</div>
  <p id="s">s</p>
  <p id="lazy">lazy</p>
  <Load client:load />
  <Idle client:idle />
  <Media client:media="(min-width: 1px)" />
  <div style="height: 3000px"></div>
  <Visible client:visible />
  <OnlyIsland client:only="react" />
  <a id="to-about" href="/about">about</a>
</Layout>
<script>
  import { cx } from '@navecss/core/cx'
  document.getElementById('s')?.setAttribute('class', cx('truncate'))
</script>
`

const ABOUT = `---
import { cx } from '@navecss/core/cx'
import Layout from '../layouts/Layout.astro'
---
<Layout>
  <div id="r" class={cx('relative')}>r</div>
  <a id="to-index" href="/">index</a>
</Layout>
`

const DYN = `---
import { cx } from '@navecss/core/cx'
import Layout from '../layouts/Layout.astro'
import Deferred from '../components/Deferred.astro'
---
<Layout>
  <div id="a" class={cx('absolute')}>a</div>
  <Deferred server:defer />
</Layout>
`

const DEFERRED = `---
import { cx } from '@navecss/core/cx'
---
<div id="d" class={cx('minW0') + ' d'}>d</div>
<style>
  .d {
    @nave flexCol;
  }
</style>
`

const PRE = `---
import { cx } from '@navecss/core/cx'
import Layout from '../layouts/Layout.astro'
export const prerender = true
---
<Layout>
  <div id="p" class={cx('roundedFull')}>p</div>
</Layout>
`

/**
 * `pre.astro` with a global `<style>` of its own, so the stylesheet of the prerendered page is
 * not the one the on-demand pages share and Astro does not rename one to the other.
 */
const PRE_STYLED = `${PRE}<style is:global>
  .pre-only {
    color: inherit;
  }
</style>
`

/**
 * The files every fixture has.
 */
export const BASE_FILES: Readonly<Record<string, string>> = {
  // Astro reads the dependencies a project lists to find the packages it must bundle.
  'package.json': JSON.stringify({
    private: true,
    type: 'module',
    dependencies: Object.fromEntries(
      ['astro', '@astrojs/react', '@astrojs/node', 'react', 'react-dom'].map((name) => [name, '*']),
    ),
  }),
  'src/styles/app.css': APP_CSS,
  'src/layouts/Layout.astro': layout(),
  'src/pages/index.astro': INDEX,
  'src/pages/about.astro': ABOUT,
  'src/components/Load.tsx': island('Load', 'grid'),
  'src/components/Idle.tsx': island('Idle', 'justifyCenter'),
  'src/components/Media.tsx': island('Media', 'flexWrap'),
  'src/components/Visible.tsx': island('Visible', 'itemsEnd'),
  'src/components/OnlyIsland.tsx': ONLY_ISLAND,
  'src/lib/lazy.ts': LAZY,
}

/**
 * The files a server row adds. In server output `index.astro` and `about.astro` are on demand;
 * `pre.astro` is added by `prerendered`.
 */
export const SERVER_FILES: Readonly<Record<string, string>> = {
  'src/pages/dyn.astro': DYN,
  'src/components/Deferred.astro': DEFERRED,
}

/**
 * The edit that puts a server project with a prerendered page in the shape where the prerendered
 * page and the on-demand pages link differently named stylesheets.
 */
export const NO_RENAME_FILES: Readonly<Record<string, string>> = {
  'src/pages/pre.astro': PRE_STYLED,
}

/**
 * A layout that imports only the layers and the atoms, so its layer is small enough for Astro to
 * inline, and a page that uses it.
 */
export const LEAN_FILES: Readonly<Record<string, string>> = {
  'src/styles/lean.css':
    "@import url('@navecss/core/layers');\n@import url('@navecss/core/atomic');\n",
  'src/layouts/Lean.astro': `---\nimport '../styles/lean.css'\n---\n<html lang="en"><head>${orderStatementLine()}<meta charset="utf-8" /><title>lean</title></head><body><slot /></body></html>\n`,
  'src/pages/lean.astro': `---\nimport { cx } from '@navecss/core/cx'\nimport Lean from '../layouts/Lean.astro'\n---\n<Lean><p id="lean" class={cx('flex')}>lean</p></Lean>\n`,
}

export const PRERENDERED_FILES: Readonly<Record<string, string>> = {
  'src/pages/pre.astro': PRE,
}
