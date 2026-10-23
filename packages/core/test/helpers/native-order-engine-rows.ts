/**
 * The rows of the three-engine test: each a rule, built by the Vite plugin and by the PostCSS
 * host (`scripts/generate-native-order-engine-fixtures.ts`), and what each engine must compute
 * for it. One rule can be read on more than one element.
 */

export interface EngineCheck {
  /**
  Whether the element is reached by the keyboard (Tab) before it is read.
   */
  readonly focused: boolean
  readonly html: string
  readonly property: string
  /**
  The pseudo-element read instead of the element itself.
   */
  readonly pseudo?: '::before'
  readonly selector: string
  readonly value: string
  /**
  The viewport width in CSS px.
   */
  readonly width: number
}

export interface EngineRow {
  readonly checks: readonly EngineCheck[]
  readonly id: string
  readonly rule: string
}

const PLAIN = '<div class="x">x</div>'
const FOCUSABLE = '<div class="x" tabindex="0">x</div>'
const RIVAL = '<div class="s1 k">x</div>'
const PSEUDO_HOLDER = '<div class="p a b">x</div>'

/**
 * A row of one check on `.x`, not focused.
 */
function onX(
  rule: string,
  width: number,
  [property, value]: readonly [property: string, value: string],
  label = rule,
): EngineRow {
  return {
    checks: [{ focused: false, html: PLAIN, property, selector: '.x', value, width }],
    id: label,
    rule,
  }
}

/**
 * A row of one check on the keyboard-focused `.x`.
 */
function focusedX(rule: string, property: string, value: string, label = rule): EngineRow {
  return {
    checks: [{ focused: true, html: FOCUSABLE, property, selector: '.x', value, width: 1280 }],
    id: label,
    rule,
  }
}

const PAIRS: readonly EngineRow[] = [
  onX('.x { @nave hidePhoneOnly flex; }', 375, ['display', 'flex']),
  onX('.x { @nave hideTabletPortraitUp grid; }', 700, ['display', 'grid']),
  onX('.x { @nave hideTabletLandscapeUp block; }', 1000, ['display', 'block']),
  onX('.x { @nave hideDesktopUp inlineFlex; }', 1280, ['display', 'inline-flex']),
  ...['srOnly', 'srOnlyFocusable'].map((atom): EngineRow => ({
    checks: [
      {
        focused: false,
        html: PLAIN,
        property: 'width',
        selector: '.x',
        value: '1px',
        width: 375,
      },
    ],
    id: `.x { @nave wFullPhoneOnly ${atom}; }`,
    rule: `.x { @nave wFullPhoneOnly ${atom}; }`,
  })),
  onX('.x { @nave flex hideDesktopUp; }', 1280, ['display', 'none'], 'control: flex hideDesktopUp'),
  onX(
    '.x { @nave hideDesktopUp hidden; }',
    1280,
    ['display', 'none'],
    'control: hideDesktopUp hidden',
  ),
]

const FOCUS: readonly EngineRow[] = [
  focusedX(
    '.x { @nave focusRing; &:focus-visible { outline-color: red } }',
    'outline-color',
    'rgb(255, 0, 0)',
  ),
  focusedX('.x { @nave focusRing; &:focus { outline: none } }', 'outline-style', 'none'),
  focusedX('.x { @nave focusRing; &:focus-visible { outline: none } }', 'outline-style', 'none'),
  focusedX(
    '.x { @nave srOnlyFocusable; &:focus-visible { position: fixed } }',
    'position',
    'fixed',
  ),
  focusedX('.x { @nave focusRing; }', 'outline-style', 'solid', 'control: focusRing'),
]

/**
 * A row read on `.s1.k`.
 */
function onRival(rule: string, property: string, value: string): EngineRow {
  return {
    checks: [{ focused: false, html: RIVAL, property, selector: '.s1.k', value, width: 1280 }],
    id: rule,
    rule,
  }
}

/**
 * A pseudo-element row read on `selector` of the holder, as the pseudo-element when `pseudo`.
 */
function onHolder(
  rule: string,
  checks: readonly { property: string; pseudo: boolean; selector: string; value: string }[],
): EngineRow {
  return {
    checks: checks.map(({ property, pseudo, selector, value }): EngineCheck => ({
      focused: false,
      html: PSEUDO_HOLDER,
      property,
      ...(pseudo && { pseudo: '::before' as const }),
      selector,
      value,
      width: 1280,
    })),
    id: rule,
    rule,
  }
}

const SHAPES: readonly EngineRow[] = [
  onRival(
    '.s1, #x .s2 { @nave hideDesktopUp; color: red } .s1.k { color: blue }',
    'color',
    'rgb(255, 0, 0)',
  ),
  onRival(
    '.s1, #x .s2 { @nave hideDesktopUp textLeft } .s1.k { text-align: right }',
    'text-align',
    'left',
  ),
  onHolder('.p::before { content: "x"; @nave hideDesktopUp; display: block; width: 10px }', [
    { property: 'width', pseudo: true, selector: '.p', value: '10px' },
  ]),
  onHolder('.p::before { content: "x"; &:hover {} @nave flex; width: 10px }', [
    { property: 'display', pseudo: true, selector: '.p', value: 'flex' },
  ]),
  onHolder('.a, .b::before { content: "x"; @nave hideDesktopUp; width: 10px }', [
    { property: 'width', pseudo: false, selector: '.a', value: '10px' },
    { property: 'width', pseudo: true, selector: '.b', value: 'auto' },
  ]),
]

const NO_SEMICOLON: readonly EngineRow[] = [
  {
    checks: [
      {
        focused: false,
        html: PLAIN,
        property: 'color',
        selector: '.x',
        value: 'rgb(255, 0, 0)',
        width: 1280,
      },
      {
        focused: true,
        html: FOCUSABLE,
        property: 'outline-style',
        selector: '.x',
        value: 'solid',
        width: 1280,
      },
    ],
    id: 'no semicolon: focusRing color',
    rule: '.x { @nave focusRing; color: red }',
  },
  onX('.x { @nave hideDesktopUp; display: grid }', 1280, ['display', 'grid'], 'no semicolon: grid'),
  onX(
    '.x { @nave hideDesktopUp focusRing; color: red }',
    1280,
    ['display', 'none'],
    'no semicolon: hide',
  ),
]

export const ENGINE_ROWS: readonly EngineRow[] = [...PAIRS, ...FOCUS, ...SHAPES, ...NO_SEMICOLON]
