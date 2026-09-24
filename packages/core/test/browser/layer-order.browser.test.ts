/**
 * @layer order resolves as documented, verified in a real browser engine.
 *
 * consumer-path.test.ts (Node) proves the @import graph resolves and
 * concatenates in the declared order; it cannot prove a real engine picks
 * the LAST-declared layer over an EARLIER one regardless of selector
 * specificity, which is the entire point of the cascade contract
 * ("Declaration order IS the contract... This replaces specificity
 * management entirely", architecture overview). That is cascade behaviour,
 * not text, so only a real engine can settle it.
 */
import { describe, expect, it } from 'vitest'

// Browser-mode test files execute inside the real browser, so the built CSS
// has to be inlined at bundle time (Vite's `?raw` import) rather than read
// with node:fs the way the Node-side smoke tests do — `?raw` is what keeps
// this reading the REAL, built dist/ output rather than a hand-typed copy.
import CORE_INDEX_CSS from '../../dist/index.css?raw'
import CORE_ATOMIC_CSS from '../../dist/atomic.css?raw'
import CORE_LAYERS_CSS from '../../dist/layers.css?raw'

// Anchored to line start so the doc comment's prose ("@layer declaration
// order is the cascade contract...") can't be greedily matched into this —
// the real at-rule is the only unindented line starting with "@layer".
const LAYER_DECLARATION = /^@layer[^;]+;/m.exec(CORE_INDEX_CSS)?.[0]

function mount(css: string): void {
  document.head.querySelectorAll('style[data-fixture]').forEach((node) => node.remove())
  const style = document.createElement('style')
  style.dataset.fixture = 'true'
  style.textContent = css
  document.head.append(style)
}

describe('@layer order resolves as documented, in a real engine', () => {
  it('reads the real declaration line out of the shipped entry point', () => {
    // Guards the fixture itself: if index.css ever drops or reorders the
    // layer declaration, this fails loudly instead of silently testing a
    // stale, hand-typed copy of the order.
    expect(LAYER_DECLARATION).toBe(
      '@layer tokens.defaults, tokens.presets, reset, atomic, components.nave, components.consumer, overrides;',
    )
  })

  it('a later layer wins over an earlier one despite far lower specificity', () => {
    mount(`
      ${LAYER_DECLARATION}
      @layer tokens {
        html body div#probe.a.b.c { color: red; }
      }
      @layer overrides {
        .probe { color: blue; }
      }
    `)
    document.body.innerHTML = '<div id="probe" class="probe a b c"></div>'

    const probe = document.querySelector('#probe') as HTMLElement
    expect(getComputedStyle(probe).color).toBe('rgb(0, 0, 255)')
  })

  it('the reverse order would have picked the other declaration (fixture sanity)', () => {
    // Same two rules, same specificities, but the LATER-in-source layer
    // (tokens) now comes first in the @layer declaration, so it should lose.
    // This rules out "browsers just always honour source order" as an
    // alternative explanation for the test above.
    mount(`
      @layer overrides, tokens;
      @layer tokens {
        html body div#probe.a.b.c { color: red; }
      }
      @layer overrides {
        .probe { color: blue; }
      }
    `)
    document.body.innerHTML = '<div id="probe" class="probe a b c"></div>'

    const probe = document.querySelector('#probe') as HTMLElement
    expect(getComputedStyle(probe).color).toBe('rgb(255, 0, 0)')
  })

  it('the real shipped atomic.css, mounted as-is, loses to a later-declared components.nave layer', () => {
    // Loads the REAL, built atomic.css (not a hand-typed reproduction) and
    // mounts it UNWRAPPED: atomic.css self-layers (build-css.ts wraps its
    // atoms in `@layer atomic { … }` and restates the order statement), so a
    // test-side `@layer atomic { … }` wrapper around it would prove nothing
    // — the fixture would pass whether or not the artifact self-layers.
    mount(`
      ${CORE_ATOMIC_CSS}
      @layer components.nave {
        .probe { display: block; }
      }
    `)
    document.body.innerHTML = '<div id="probe" class="probe nave-hidden"></div>'

    const probe = document.querySelector('#probe') as HTMLElement
    expect(getComputedStyle(probe).display).toBe('block')
  })
})

describe('the cascade contract precondition: Nave must be the first @layer declaration seen (ADR 0003)', () => {
  it('a consumer overrides block declared before Nave inverts the order and loses to atomic', () => {
    // CSS fixes a layer's position at its first declaration anywhere in the
    // document. A consumer stylesheet that reaches the page before Nave's
    // order statement registers `overrides` first, making it the WEAKEST
    // layer — the documented failure this fixture guards. The consumer's
    // rule has higher specificity (#probe vs .nave-hidden) and still loses,
    // which is the precise promise failing.
    mount(`
      @layer overrides {
        #probe { display: block; }
      }
      ${CORE_ATOMIC_CSS}
    `)
    document.body.innerHTML = '<div id="probe" class="probe nave-hidden"></div>'

    const probe = document.querySelector('#probe') as HTMLElement
    expect(getComputedStyle(probe).display).toBe('none')
  })

  it('importing @navecss/core/layers first fixes it: overrides then wins as documented', () => {
    // Same consumer bytes as above, same source order (consumer's `overrides`
    // block still precedes atomic.css), but @navecss/core/layers is mounted
    // FIRST. It registers the seven names in the documented order before
    // anything else is seen, so `overrides` lands in its correct, strongest
    // position; the consumer's `@layer overrides` block and atomic.css's own
    // copy of the statement then change nothing (a name already known keeps
    // its position).
    mount(`
      ${CORE_LAYERS_CSS}
      @layer overrides {
        #probe { display: block; }
      }
      ${CORE_ATOMIC_CSS}
    `)
    document.body.innerHTML = '<div id="probe" class="probe nave-hidden"></div>'

    const probe = document.querySelector('#probe') as HTMLElement
    expect(getComputedStyle(probe).display).toBe('block')
  })
})
