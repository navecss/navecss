/**
 * The nine cascade shapes of the Astro criteria: a layout with or without `<ClientRouter />`,
 * a consumer rule in `@layer components.consumer` that must beat the `nave-flex` atom of
 * `#c`, living in the page's global `<style>`, the page's scoped `<style>`, or a component
 * imported before or after the layout. Without the order statement first in the layout's head
 * some of them invert in a build; with it none does.
 */
import { orderStatementLine } from './astro-readme.ts'

export const SHAPES = ['p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7', 'p8', 'p9'] as const

const CONSUMER = `  @layer components.consumer {
    #c {
      display: grid;
    }
  }
`

/**
 * A layout that imports `app.css`, with `<ClientRouter />` or without, and the order statement
 * first in its head or not.
 */
function layout(options: { remedy: boolean; router: boolean }): string {
  return `---
${options.router ? "import { ClientRouter } from 'astro:transitions'\n" : ''}import '../styles/app.css'
---
<html lang="en">
  <head>
    ${options.remedy ? `${orderStatementLine()}\n    ` : ''}<meta charset="utf-8" />
    <title>shape</title>
    ${options.router ? '<ClientRouter />' : ''}
  </head>
  <body>
    <slot />
    ${options.router ? NAVIGATION : ''}
  </body>
</html>
`
}

const NAVIGATION = `<nav>
      <a id="to-p1" href="/c/p1/">p1</a>
      <a id="to-p2" href="/c/p2/">p2</a>
      <a id="to-p8" href="/c/p8/">p8</a>
      <a id="to-p9" href="/c/p9/">p9</a>
    </nav>`

const CARD = `---
import { cx } from '@navecss/core/cx'
---
<p id="c" class={cx('flex')}>c</p>
<style>
${CONSUMER}</style>
`

const CLASS_PAGE = (layoutName: string, style: string): string => `---
import { cx } from '@navecss/core/cx'
import L from '../../layouts/${layoutName}.astro'
---
<L><p id="c" class={cx('flex')}>c</p></L>
${style}
`

/**
 * More than Astro inlines, so the page's stylesheet is a file.
 */
const PADDING = Array.from(
  { length: 220 },
  (_, index) => `  .pad${index} { margin-top: ${index}px; }`,
).join('\n')

/**
 * The files of the shapes: two layouts, a component, nine pages under `/c/`.
 */
export function shapeFiles(hasRemedy: boolean): Record<string, string> {
  return {
    'src/layouts/LCR.astro': layout({ router: true, remedy: hasRemedy }),
    'src/layouts/LNO.astro': layout({ router: false, remedy: hasRemedy }),
    'src/components/Card.astro': CARD,
    'src/pages/c/p1.astro': CLASS_PAGE('LCR', `<style is:global>\n${CONSUMER}</style>`),
    'src/pages/c/p2.astro': CLASS_PAGE('LCR', `<style>\n${CONSUMER}</style>`),
    'src/pages/c/p3.astro': CLASS_PAGE('LNO', `<style is:global>\n${CONSUMER}</style>`),
    'src/pages/c/p4.astro': CLASS_PAGE('LNO', `<style>\n${CONSUMER}</style>`),
    'src/pages/c/p5.astro': CLASS_PAGE('LNO', `<style>\n${CONSUMER}${PADDING}\n</style>`),
    'src/pages/c/p6.astro': `---
import Card from '../../components/Card.astro'
import L from '../../layouts/LNO.astro'
---
<L><Card /></L>
`,
    'src/pages/c/p7.astro': `---
import L from '../../layouts/LNO.astro'
import Card from '../../components/Card.astro'
---
<L><Card /></L>
`,
    'src/pages/c/p8.astro': `---
import Card from '../../components/Card.astro'
import L from '../../layouts/LCR.astro'
---
<L><Card /></L>
`,
    'src/pages/c/p9.astro': `---
import L from '../../layouts/LCR.astro'
import Card from '../../components/Card.astro'
---
<L><Card /></L>
`,
  }
}
