/**
 * The inputs of the first-minor fixtures, with what a real engine is expected to compute for each
 * under the previous release's output and under this one. Lives with the migration module and is
 * removed with it.
 *
 * `migration-old-placement.json` holds what the previous release printed for every `input` here
 * (`scripts/generate-migration-old-placement.ts`); the tests compare it with what the plugin
 * prints now, and the browser test renders both.
 */
import type { AtomDefinition } from '../../src/atoms.ts'

/**
 * Where a row is rendered and which computed value it reads.
 */
export interface Measure {
  /**
  Whether the element is reached by the keyboard before it is read.
   */
  readonly focused: boolean
  readonly html: string
  /**
  The computed property, in kebab case.
   */
  readonly property: string
  /**
  The pseudo-element read instead of the element itself.
   */
  readonly pseudo?: '::before'
  readonly selector: string
  /**
  The viewport width in CSS px.
   */
  readonly width: number
}

export interface MigrationRow {
  /**
  Whether the new output is equivalent to the previous release's.
   */
  readonly equivalent: boolean
  readonly extend?: Record<string, AtomDefinition>
  readonly id: string
  readonly input: string
  readonly measure: Measure
  /**
  What the new output computes.
   */
  readonly now: string
  /**
  What the previous release's output computes.
   */
  readonly was: string
  /**
   * What its text expander's output computes where that differs from `was`: it printed a rule
   * whose last declaration has no semicolon with the moved block glued to that declaration, which
   * an engine drops.
   */
  readonly textWas?: string
}

/**
Stands for the element's own `color`, which `currentColor` computes to.
 */
export const ELEMENT_COLOR = 'the element color'

const HIDERS = [
  ['hidePhoneOnly', 375],
  ['hideTabletPortraitUp', 700],
  ['hideTabletLandscapeUp', 1000],
  ['hideDesktopUp', 1280],
] as const

const DISPLAYS = [
  ['flex', 'flex'],
  ['inlineFlex', 'inline-flex'],
  ['grid', 'grid'],
  ['block', 'block'],
  ['inlineBlock', 'inline-block'],
] as const

const PLAIN = '<div class="x">x</div>'
const FOCUSABLE = '<div class="x" tabindex="0">x</div>'
const IN_BLOCK_OF_300 = '<div style="position: relative; width: 300px"><div class="x">x</div></div>'

/**
 * The 22 pairs in which the later atom's declaration used to lose to the earlier atom's block.
 */
function pairRows(): readonly MigrationRow[] {
  const displays = HIDERS.flatMap(([hider, width]) =>
    DISPLAYS.map(([atom, value]): MigrationRow => ({
      equivalent: false,
      id: `pair ${hider} ${atom}`,
      input: `.x { @nave ${hider} ${atom}; }`,
      measure: { focused: false, html: PLAIN, property: 'display', selector: '.x', width },
      now: value,
      was: 'none',
    })),
  )
  const widths = ['srOnly', 'srOnlyFocusable'].map((atom): MigrationRow => ({
    equivalent: false,
    id: `pair wFullPhoneOnly ${atom}`,
    input: `.x { @nave wFullPhoneOnly ${atom}; }`,
    measure: {
      focused: false,
      html: IN_BLOCK_OF_300,
      property: 'width',
      selector: '.x',
      width: 375,
    },
    now: '1px',
    was: '300px',
  }))
  return [...displays, ...widths]
}

/**
 * C3, F3, F9 and P4: a nested rule after an atom whose focus block used to be placed after it.
 */
function focusRows(): readonly MigrationRow[] {
  const focused = (input: string, property: string, was: string, now: string): MigrationRow => ({
    equivalent: false,
    id: input,
    input,
    measure: { focused: true, html: FOCUSABLE, property, selector: '.x', width: 1280 },
    now,
    was,
  })
  return [
    focused(
      '.x { @nave focusRing; &:focus-visible { outline-color: red } }',
      'outline-color',
      ELEMENT_COLOR,
      'rgb(255, 0, 0)',
    ),
    focused('.x { @nave focusRing; &:focus { outline: none } }', 'outline-style', 'solid', 'none'),
    focused(
      '.x { @nave focusRing; &:focus-visible { outline: none } }',
      'outline-style',
      'solid',
      'none',
    ),
    focused(
      '.x { @nave srOnlyFocusable; &:focus-visible { position: fixed } }',
      'position',
      'static',
      'fixed',
    ),
  ]
}

interface Outcome {
  readonly now: string
  readonly property: string
  /**
  What its text expander's output computes where that differs from `was`.
   */
  readonly textWas?: string
  readonly was: string
}

/**
 * The two mixed-specificity lists, read on the element `.s1.k` that a rival rule also matches.
 */
function mixedListRows(): readonly MigrationRow[] {
  const rival = (input: string, { now, property, was }: Outcome): MigrationRow => ({
    equivalent: false,
    id: input,
    input,
    measure: {
      focused: false,
      html: '<div class="s1 k">x</div>',
      property,
      selector: '.s1.k',
      width: 1280,
    },
    now,
    was,
  })
  return [
    rival('.s1, #x .s2 { @nave hideDesktopUp; color: red } .s1.k { color: blue }', {
      now: 'rgb(255, 0, 0)',
      property: 'color',
      was: 'rgb(0, 0, 255)',
    }),
    rival('.s1, #x .s2 { @nave hideDesktopUp textLeft } .s1.k { text-align: right }', {
      now: 'left',
      property: 'text-align',
      was: 'right',
    }),
  ]
}

/**
 * The three rules with a pseudo-element selector, read on the pseudo-element.
 */
function pseudoElementRows(): readonly MigrationRow[] {
  const pseudo = (
    input: string,
    selector: string,
    { now, property, textWas, was }: Outcome,
  ): MigrationRow => ({
    equivalent: false,
    id: input,
    input,
    measure: {
      focused: false,
      html: '<div class="p a b">x</div>',
      property,
      pseudo: '::before',
      selector,
      width: 1280,
    },
    now,
    was,
    ...(textWas !== undefined && { textWas }),
  })
  return [
    pseudo('.p::before { content: "x"; @nave hideDesktopUp; display: block; width: 10px }', '.p', {
      now: '10px',
      property: 'width',
      textWas: '1280px',
      was: '10px',
    }),
    pseudo('.p::before { content: "x"; &:hover {} @nave flex; width: 10px }', '.p', {
      now: 'flex',
      property: 'display',
      was: 'inline',
    }),
    pseudo('.a, .b::before { content: "x"; @nave hideDesktopUp; width: 10px }', '.b', {
      now: 'auto',
      property: 'width',
      textWas: 'auto',
      was: '10px',
    }),
  ]
}

const EXTEND_ATOMS: Record<string, AtomDefinition> = {
  mA: { declarations: {}, media: { '(width >= 75em)': { declarations: { color: 'red' } } } },
  mB: { declarations: {}, media: { '(width >= 60em)': { declarations: { color: 'blue' } } } },
}

/**
 * The row that stays the same, and the logical variant measured in a block of 400px.
 */
function otherRows(): readonly MigrationRow[] {
  return [
    {
      equivalent: true,
      extend: EXTEND_ATOMS,
      id: 'extend atoms mA mB',
      input: '.x { @nave mA mB; }',
      measure: { focused: false, html: PLAIN, property: 'color', selector: '.x', width: 1280 },
      now: 'rgb(0, 0, 255)',
      was: 'rgb(0, 0, 255)',
    },
    {
      equivalent: false,
      id: 'logical variant',
      input: '.card { @nave wFullPhoneOnly; inline-size: 50%; }',
      measure: {
        focused: false,
        html: '<div style="width: 400px"><div class="card">x</div></div>',
        property: 'width',
        selector: '.card',
        width: 500,
      },
      now: '200px',
      was: '400px',
    },
  ]
}

export const MIGRATION_ROWS: readonly MigrationRow[] = [
  ...pairRows(),
  ...focusRows(),
  ...mixedListRows(),
  ...pseudoElementRows(),
  ...otherRows(),
]
