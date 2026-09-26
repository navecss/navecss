/**
 * Nave atomic utilities — single source of truth.
 *
 * Each atom defines:
 *   declarations  — CSS property/value pairs applied to the base selector
 *   pseudos       — rules scoped to pseudo-classes (:hover, :focus-visible, etc.)
 *   media         — rules scoped to @media conditions
 *                   Always use strings from @navecss/tokens/breakpoints as keys.
 *                   Never write breakpoint values as magic numbers.
 *
 * Consumed by:
 *   1. scripts/build-css.ts        → dist/atomic.css (global .nave-* classes)
 *   2. src/cx.ts                   → AtomName type + cx() utility
 *   3. src/postcss.ts              → resolves @nave directives
 *
 * Naming: camelCase keys → nave-kebab-case class names
 *   focusRing → .nave-focus-ring
 *
 * ─── Consumer atoms ───────────────────────────────────────────────────────
 * Teams extend @nave with their own atoms via navePlugin({ extend: myAtoms }).
 * Consumer atoms: @nave-directive only. No global class. Not in cx().
 * See CONSUMER-ATOMS.md for the full pattern.
 * ──────────────────────────────────────────────────────────────────────────
 */
import { media } from '@navecss/tokens/breakpoints'

// ── Types ─────────────────────────────────────────────────────────────────────

type CSSDeclarations = Record<string, string>

type PseudoMap = Record<string, CSSDeclarations>

interface MediaBlock {
  declarations?: CSSDeclarations
  pseudos?: PseudoMap
}

export interface AtomDefinition {
  declarations: CSSDeclarations
  pseudos?: PseudoMap
  media?: Record<string, MediaBlock>
  container?: Record<string, MediaBlock>
}

/**
 * srOnly declarations, shared between `srOnly` and `srOnlyFocusable` so the
 * hidden/revealed pair never drifts apart (a hand-copied "restore" list is
 * the failure mode: it drifts and misses one property, producing a
 * half-revealed element worse than either state).
 *
 * Each property earns its place:
 *   position: absolute + 1x1px box   — stays in the accessibility tree and in
 *     document flow (unlike display: none / visibility: hidden, which remove
 *     it), but occupies no visible space.
 *   1px, not 0                       — a zero-size box is dropped from the
 *     accessibility tree by some assistive tech; 1px is not.
 *   margin: -1px                     — cancels the 1px box out of layout flow.
 *   clip-path: inset(50%)            — the modern replacement for the
 *     deprecated `clip: rect(...)`. Equivalent effect, Baseline 2024, and
 *     unlike `clip` it does not silently stop working if a consumer
 *     overrides `position` (`clip` only applies to absolutely positioned
 *     elements).
 *   white-space: nowrap              — without it, long text wraps inside the
 *     1px box and renders as a visible column of single characters. The
 *     property most often dropped by a "simplified" reimplementation.
 */
const srOnlyDeclarations: CSSDeclarations = {
  position: 'absolute',
  width: '1px',
  height: '1px',
  padding: '0',
  margin: '-1px',
  overflow: 'hidden',
  'clip-path': 'inset(50%)',
  'white-space': 'nowrap',
  'border-width': '0',
}

/**
 * The visible state `srOnlyFocusable` restores to on focus.
 */
const srOnlyRevealed: CSSDeclarations = {
  position: 'static',
  width: 'auto',
  height: 'auto',
  margin: '0',
  overflow: 'visible',
  'clip-path': 'none',
  'white-space': 'normal',
}

// ── Atoms ─────────────────────────────────────────────────────────────────────

export const atoms = {
  // ── Display ────────────────────────────────────────────────────────────────
  flex: {
    declarations: { display: 'flex' },
  },
  inlineFlex: {
    declarations: { display: 'inline-flex' },
  },
  grid: {
    declarations: { display: 'grid' },
  },
  block: {
    declarations: { display: 'block' },
  },
  inlineBlock: {
    declarations: { display: 'inline-block' },
  },
  hidden: {
    declarations: { display: 'none' },
  },

  // ── Flex ───────────────────────────────────────────────────────────────────
  flexCol: {
    declarations: { 'flex-direction': 'column' },
  },
  flexWrap: {
    declarations: { 'flex-wrap': 'wrap' },
  },
  itemsCenter: {
    declarations: { 'align-items': 'center' },
  },
  itemsStart: {
    declarations: { 'align-items': 'flex-start' },
  },
  itemsEnd: {
    declarations: { 'align-items': 'flex-end' },
  },
  justifyCenter: {
    declarations: { 'justify-content': 'center' },
  },
  justifyBetween: {
    declarations: { 'justify-content': 'space-between' },
  },
  justifyEnd: {
    declarations: { 'justify-content': 'flex-end' },
  },
  flexGrow: {
    declarations: { 'flex-grow': '1' },
  },
  flexShrink0: {
    declarations: { 'flex-shrink': '0' },
  },
  gap: {
    declarations: { gap: 'var(--nave-spacing-content-md)' },
  },

  // ── Position ───────────────────────────────────────────────────────────────
  relative: {
    declarations: { position: 'relative' },
  },
  absolute: {
    declarations: { position: 'absolute' },
  },
  insetFull: {
    declarations: { inset: '0' },
  },

  // ── Sizing ─────────────────────────────────────────────────────────────────
  wFull: {
    declarations: { width: '100%' },
  },
  hFull: {
    declarations: { height: '100%' },
  },
  minW0: {
    declarations: { 'min-width': '0' },
  },

  // ── Typography ─────────────────────────────────────────────────────────────
  truncate: {
    declarations: {
      overflow: 'hidden',
      'text-overflow': 'ellipsis',
      'white-space': 'nowrap',
    },
  },
  /**
   * srOnly — visually hidden, accessible to screen readers.
   * Every property in the shared declaration set is load-bearing: the 1x1 box
   * stays in the accessibility tree where display: none would not, the box is
   * 1px rather than 0 because a zero-size box is dropped from that tree by some
   * assistive technology, the negative margin cancels it out of layout flow,
   * clip-path is used rather than clip so it keeps working if a consumer
   * overrides position, and nowrap stops long text rendering as a visible
   * column of single characters. Do not simplify.
   */
  srOnly: {
    declarations: srOnlyDeclarations,
  },
  /**
   * srOnlyFocusable — srOnly that reveals itself when it (or a descendant)
   * receives keyboard focus. The skip-link pattern needs this: an element
   * hidden until it receives keyboard focus. Plain srOnly on a skip link
   * produces a focusable element that is permanently invisible, so a
   * keyboard user tabs into apparent nothingness.
   *
   * :focus-visible — the element itself is the focusable (e.g. the skip
   *   link anchor carries this atom directly).
   * :focus-within  — the hidden element wraps the focusable rather than
   *   being it.
   */
  srOnlyFocusable: {
    declarations: srOnlyDeclarations,
    pseudos: {
      ':focus-visible': srOnlyRevealed,
      ':focus-within': srOnlyRevealed,
    },
  },
  noWrap: {
    declarations: { 'white-space': 'nowrap' },
  },
  breakWord: {
    declarations: { 'overflow-wrap': 'break-word' },
  },
  textLeft: {
    declarations: { 'text-align': 'left' },
  },
  textCenter: {
    declarations: { 'text-align': 'center' },
  },
  textRight: {
    declarations: { 'text-align': 'right' },
  },

  // ── Interaction ────────────────────────────────────────────────────────────
  /**
   * interactive — base for any clickable non-button element.
   * -webkit-tap-highlight-color removes the grey tap flash on iOS/Android.
   * -webkit-user-select is required alongside user-select: every released Safari and every
   * iOS browser (all WebKit-based, regardless of the label on the tin) reads only the
   * prefixed property; the unprefixed one is Safari-preview-only per BCD.
   */
  interactive: {
    declarations: {
      cursor: 'pointer',
      '-webkit-user-select': 'none',
      'user-select': 'none',
      '-webkit-tap-highlight-color': 'transparent',
    },
  },
  /**
   * focusRing — keyboard focus indicator.
   * :focus-visible — keyboard users see it, mouse users do not.
   */
  focusRing: {
    declarations: {
      outline: 'none',
    },
    pseudos: {
      ':focus-visible': {
        outline: 'var(--nave-border-width-focus) solid var(--nave-color-border-focus)',
        'outline-offset': '2px',
      },
    },
  },
  /**
   * disabledState — visual + behavioural disabled treatment.
   * Applies from either the native `disabled` attribute or
   * `aria-disabled="true"`. On the aria-disabled branch the element stays
   * focusable by design: this atom only blocks pointer activation
   * (pointer-events: none), so the component's own activation handler must
   * also check the attribute and no-op on Enter and Space, since CSS cannot
   * prevent keyboard activation.
   *
   * Expresses disablement through the dedicated disabled colour tokens
   * (content.disabled, border.disabled) rather than a blanket opacity: a
   * uniform dim composites everything the element paints, including a
   * focusRing outline on the aria-disabled branch.
   * `color` also carries inline icons (reset.css's `svg:not([fill])
   * { fill: currentcolor }`); `border-color` is inert on a borderless
   * element. Deliberately silent on `background-color`: the atom cannot
   * know whether the element is a filled control, a ghost button, a link
   * or a label, so a filled control's disabled fill is a component
   * obligation, not this atom's.
   *
   * No `cursor` here: `pointer-events: none` stops the element from ever being hit-tested,
   * so a `cursor` declared on it can never paint (the browser resolves the pointer against
   * whatever is underneath instead). That is equally true of reset.css's
   * `[disabled], [aria-disabled='true'] { cursor: not-allowed }` on an element carrying this
   * atom: while the atom applies, no cursor paints on that element at all. The reset rule
   * serves the disabled elements that do NOT carry this atom. What is removed here is a
   * declaration that never rendered, so nothing a user sees changes.
   */
  disabledState: {
    declarations: {},
    pseudos: {
      ':disabled, [aria-disabled="true"]': {
        color: 'var(--nave-color-content-disabled)',
        'border-color': 'var(--nave-color-border-disabled)',
        'pointer-events': 'none',
      },
    },
  },

  // ── Visual ─────────────────────────────────────────────────────────────────
  rounded: {
    declarations: { 'border-radius': 'var(--nave-radius-control)' },
  },
  roundedCard: {
    declarations: { 'border-radius': 'var(--nave-radius-card)' },
  },
  roundedFull: {
    declarations: { 'border-radius': 'var(--nave-radius-full)' },
  },
  border: {
    declarations: {
      border: 'var(--nave-border-width-sm) solid var(--nave-color-border-default)',
    },
  },
  overflowHidden: {
    declarations: { overflow: 'hidden' },
  },
  overflowAuto: {
    declarations: { overflow: 'auto' },
  },

  // ── Transition ─────────────────────────────────────────────────────────────
  transition: {
    declarations: {
      'transition-property': 'color, background-color, border-color, opacity, box-shadow',
      'transition-duration': 'var(--nave-motion-duration-base)',
      'transition-timing-function': 'var(--nave-motion-easing-standard)',
    },
  },

  // ── Containment ────────────────────────────────────────────────────────────
  //
  // container establishes a containment context so that child components
  // can use @container queries to respond to available space rather than
  // viewport size. This is the correct tool for component-level responsiveness.
  //
  // Usage:
  //   <div className={styles.cardWrapper}>   ← apply container atom here
  //     <Card />                             ← Card uses @container internally
  //   </div>
  //
  // Named containers:
  //   If you need to query a specific named container, define it in your
  //   component's CSS Module directly — the container shorthand with a name
  //   requires a string value that cannot be expressed as a static atom:
  //     .wrapper { container: my-sidebar / inline-size; }
  //
  // container-type: inline-size is the correct default for most cases.
  //   It queries the inline (horizontal) dimension only, which is what
  //   almost all responsive component layouts need. Using `size` queries
  //   both dimensions and requires the container to have a known block size,
  //   which is rarely what you want for standard flow layout.

  /**
   * container
   * Establishes an inline-size containment context.
   * Apply to the wrapper of any component that uses @container queries.
   * Required — container queries have no effect without a containment ancestor.
   */
  container: {
    declarations: {
      'container-type': 'inline-size',
    },
  },

  // ── Responsive ─────────────────────────────────────────────────────────────
  //
  // Philosophy: mobile-first. All responsive atoms start from the smallest
  // context and expand upward using min-width (>=) queries, except phoneOnly
  // which is the one legitimate max-width exception — it targets a specific
  // device class, not "below X."
  //
  // Media strings come from @navecss/tokens/breakpoints.
  // Never write breakpoint values as magic numbers here or in consumer atoms.
  //
  // Naming: [behaviour]-[when]
  //   hide*   — visibility
  //   stack*  — flex-direction change
  //   wFull*  — width change
  //   [when]  — matches the media export name (phoneOnly, tabletPortraitUp, etc.)
  //
  // Why no show* atoms?
  //   Restoring display requires knowing the original value (block, flex, grid).
  //   That context belongs in the component. Use hide* on the element that has
  //   a replacement, rather than show* on the replacement itself.
  //
  // Why only phoneOnly for stack* and wFull*?
  //   Stack and full-width behaviours applied above phone are layout decisions
  //   that belong in component-specific consumer atoms, not shared utilities.
  //   The built-in set models good mobile-first habits — it doesn't provide
  //   shortcuts around them.

  /**
   * hidePhoneOnly
   * Hidden on phone. Visible on tablet portrait and above.
   * Use for: elements that have a dedicated phone replacement.
   */
  hidePhoneOnly: {
    declarations: {},
    media: {
      [media.phoneOnly]: {
        declarations: { display: 'none' },
      },
    },
  },

  /**
   * hideTabletPortraitUp
   * Hidden on tablet portrait and above. Visible on phone only.
   * Use for: mobile-only elements (hamburger triggers, bottom nav, etc.)
   */
  hideTabletPortraitUp: {
    declarations: {},
    media: {
      [media.tabletPortraitUp]: {
        declarations: { display: 'none' },
      },
    },
  },

  /**
   * hideTabletLandscapeUp
   * Hidden on tablet landscape and above. Visible on phone and tablet portrait.
   * Use for: compact tablet navigation that gives way to a full desktop nav.
   */
  hideTabletLandscapeUp: {
    declarations: {},
    media: {
      [media.tabletLandscapeUp]: {
        declarations: { display: 'none' },
      },
    },
  },

  /**
   * hideDesktopUp
   * Hidden on desktop and above. Visible on tablet landscape and below.
   * Use for: mobile/tablet UI that has a desktop structural replacement.
   */
  hideDesktopUp: {
    declarations: {},
    media: {
      [media.desktopUp]: {
        declarations: { display: 'none' },
      },
    },
  },

  /**
   * stackPhoneOnly
   * flex-direction: column on phone. Assumes the element is display: flex.
   * Use for: button groups, form rows, icon+label pairs that stack on mobile.
   */
  stackPhoneOnly: {
    declarations: {},
    media: {
      [media.phoneOnly]: {
        declarations: { 'flex-direction': 'column' },
      },
    },
  },

  /**
   * wFullPhoneOnly
   * width: 100% on phone only.
   * Use for: buttons and inputs that should be full-width on mobile.
   */
  wFullPhoneOnly: {
    declarations: {},
    media: {
      [media.phoneOnly]: {
        declarations: { width: '100%' },
      },
    },
  },
} as const satisfies Record<string, AtomDefinition>

// ── Derived types and helpers ─────────────────────────────────────────────────

export type AtomName = keyof typeof atoms

/**
 * Converts a camelCase atom name to its nave-kebab-case CSS class name.
 * focusRing → nave-focus-ring
 */
export const toClassName = (name: AtomName): string =>
  `nave-${name.replaceAll(/([A-Z])/g, '-$1').toLowerCase()}`

/**
 * Map of atom name → global CSS class name.
 * Used by cx() and the directive core's diagnostic hints.
 * Only covers Nave built-in atoms — consumer atoms are @nave-directive only.
 */
export const atomClassMap = Object.fromEntries(
  (Object.keys(atoms) as AtomName[]).map((name) => [name, toClassName(name)]),
) as Record<AtomName, string>
