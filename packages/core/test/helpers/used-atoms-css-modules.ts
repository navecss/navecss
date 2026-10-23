/**
 * The fixture of the CSS Module criterion (AC-used-atoms-61): a module that composes Nave classes
 * from global, composes from another module, and holds a selector and a local class that name an
 * atom without using it, and the entry that applies three of its classes.
 */

/**
 * `src/card.module.css`, unlayered. Each rule is there for a reason of its own: `.box` is a valid
 * identifier (a named export), `.my-box` is kebab-case (a key of the default export only), `.card`
 * composes from another file, the two selectors name an atom without applying it, and the local
 * `.nave-sr-only` exports a hashed value.
 */
export const CARD_MODULE = `.box { composes: nave-flex from global; }
.my-box { composes: nave-grid nave-gap from global; }
.card { composes: base from './base.module.css'; }
.sel :global(.nave-hidden) { color: red; }
:global(.nave-block) { color: blue; }
.nave-sr-only { color: green; }
`

const MAIN = `import './app.css'
import s from './card.module.css'
const root = document.querySelector('#app')!
for (const name of [s.box, s['my-box'], s.card]) {
  const element = document.createElement('div')
  element.className = name
  root.append(element)
}
`

/**
 * The files of the fixture, to merge over `appFiles()`'s own.
 */
export function cssModuleFiles(): Record<string, string> {
  return {
    'src/card.module.css': CARD_MODULE,
    'src/base.module.css': '.base { composes: nave-inline-flex from global; }\n',
    'src/main.ts': MAIN,
  }
}
