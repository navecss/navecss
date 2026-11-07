/**
 * The 33 inputs of the native-order outcome rows, with the value a real engine is expected to
 * compute for each under the output the plugin prints: the 22 pairs, the 4 focus shapes, the 5
 * shapes and the 2 more. The Chromium test mounts each row's output and reads `now` at `measure`.
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

export interface OutcomeRow {
  readonly extend?: Record<string, AtomDefinition>
  readonly id: string
  readonly input: string
  readonly measure: Measure
  /**
  What the new output computes.
   */
  readonly now: string
}

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
 * The 22 pairs in which the later atom's declaration wins over the earlier atom's block.
 */
function pairRows(): readonly OutcomeRow[] {
  const displays = HIDERS.flatMap(([hider, width]) =>
    DISPLAYS.map(([atom, value]): OutcomeRow => ({
      id: `pair ${hider} ${atom}`,
      input: `.x { @nave ${hider} ${atom}; }`,
      measure: { focused: false, html: PLAIN, property: 'display', selector: '.x', width },
      now: value,
    })),
  )
  const widths = ['srOnly', 'srOnlyFocusable'].map((atom): OutcomeRow => ({
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
  }))
  return [...displays, ...widths]
}

/**
 * C3, F3, F9 and P4: a nested rule after an atom with a focus block, which the nested rule overrides.
 */
function focusRows(): readonly OutcomeRow[] {
  const focused = (input: string, property: string, now: string): OutcomeRow => ({
    id: input,
    input,
    measure: { focused: true, html: FOCUSABLE, property, selector: '.x', width: 1280 },
    now,
  })
  return [
    focused(
      '.x { @nave focusRing; &:focus-visible { outline-color: red } }',
      'outline-color',
      'rgb(255, 0, 0)',
    ),
    focused('.x { @nave focusRing; &:focus { outline: none } }', 'outline-style', 'none'),
    focused('.x { @nave focusRing; &:focus-visible { outline: none } }', 'outline-style', 'none'),
    focused(
      '.x { @nave srOnlyFocusable; &:focus-visible { position: fixed } }',
      'position',
      'fixed',
    ),
  ]
}

interface Outcome {
  readonly now: string
  readonly property: string
}

/**
 * The two mixed-specificity lists, read on the element `.s1.k` that a rival rule also matches.
 */
function mixedListRows(): readonly OutcomeRow[] {
  const rival = (input: string, { now, property }: Outcome): OutcomeRow => ({
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
  })
  return [
    rival('.s1, #x .s2 { @nave hideDesktopUp; color: red } .s1.k { color: blue }', {
      now: 'rgb(255, 0, 0)',
      property: 'color',
    }),
    rival('.s1, #x .s2 { @nave hideDesktopUp textLeft } .s1.k { text-align: right }', {
      now: 'left',
      property: 'text-align',
    }),
  ]
}

/**
 * The three rules with a pseudo-element selector, read on the pseudo-element.
 */
function pseudoElementRows(): readonly OutcomeRow[] {
  const pseudo = (input: string, selector: string, { now, property }: Outcome): OutcomeRow => ({
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
  })
  return [
    pseudo('.p::before { content: "x"; @nave hideDesktopUp; display: block; width: 10px }', '.p', {
      now: '10px',
      property: 'width',
    }),
    pseudo('.p::before { content: "x"; &:hover {} @nave flex; width: 10px }', '.p', {
      now: 'flex',
      property: 'display',
    }),
    pseudo('.a, .b::before { content: "x"; @nave hideDesktopUp; width: 10px }', '.b', {
      now: 'auto',
      property: 'width',
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
function otherRows(): readonly OutcomeRow[] {
  return [
    {
      extend: EXTEND_ATOMS,
      id: 'extend atoms mA mB',
      input: '.x { @nave mA mB; }',
      measure: { focused: false, html: PLAIN, property: 'color', selector: '.x', width: 1280 },
      now: 'rgb(0, 0, 255)',
    },
    {
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
    },
  ]
}

export const OUTCOME_ROWS: readonly OutcomeRow[] = [
  ...pairRows(),
  ...focusRows(),
  ...mixedListRows(),
  ...pseudoElementRows(),
  ...otherRows(),
]
