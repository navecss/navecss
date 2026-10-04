/**
 * Classifying a declared value against the forms the stylesheet may use: a token read, a Base UI
 * output variable, a keyword, and the few named literals. Anything else is returned as unaccepted.
 */
import valueParser from 'postcss-value-parser'

import { COLOR_KEYWORDS } from './colors.ts'

/**
 * Literals the normative bytes mark by name: sizes, offsets and rotations.
 */
export const NAMED_LITERALS: ReadonlySet<string> = new Set([
  '-45deg',
  '-4px',
  '-0.125rem',
  '0deg',
  '0.3125rem',
  '0.5rem',
  '0.5625rem',
  '2px',
  '8px',
  '20rem',
  '32rem',
  '45deg',
  '135deg',
  '180deg',
  '225deg',
])

/**
 * The two fallbacks a `var()` may carry: the focus ring's width and colour, byte for byte.
 */
export const ADMITTED_FALLBACKS: readonly string[] = [
  'var(--nave-border-width-focus, 2px)',
  'var(--nave-color-border-focus, currentColor)',
]

/**
 * The variables Base UI writes for a consumer's CSS to read, as the styled parts use them.
 */
export const BASE_UI_VARIABLES: ReadonlySet<string> = new Set([
  '--accordion-panel-height',
  '--active-tab-height',
  '--active-tab-left',
  '--active-tab-top',
  '--active-tab-width',
  '--anchor-width',
  '--available-height',
  '--collapsible-panel-height',
])

export interface ValueContext {
  readonly property: string
  /**
   * Whether the declaration sits in a `::placeholder` rule, where `opacity: 1` is admitted by name.
   */
  readonly isPlaceholder: boolean
  /**
   * The custom properties the workspace tokens declare.
   */
  readonly tokens: ReadonlySet<string>
}

const KEYWORDS_ADMITTED = new Set(['currentcolor', 'inherit', 'transparent'])
const OPERATORS = new Set(['*', '+', '-', '/'])
const FIXED_WORDS = new Set(['0', '50%', '100%'])

const isNumber = (word: string): boolean => /^-?\d+(\.\d+)?$/.test(word)

const isAdmittedOne = (context: ValueContext): boolean =>
  context.property === 'flex' || (context.property === 'opacity' && context.isPlaceholder)

const isAdmittedWord = (word: string, context: ValueContext, isInsideCalc: boolean): boolean =>
  FIXED_WORDS.has(word) ||
  NAMED_LITERALS.has(word) ||
  (word === '1' && isAdmittedOne(context)) ||
  (isInsideCalc && (isNumber(word) || OPERATORS.has(word)))

const wordViolation = (
  word: string,
  context: ValueContext,
  isInsideCalc: boolean,
): string | undefined => {
  const lower = word.toLowerCase()
  if (KEYWORDS_ADMITTED.has(lower)) return undefined
  if (/^[a-z][a-z-]*$/i.test(word)) return COLOR_KEYWORDS.has(lower) ? word : undefined
  return isAdmittedWord(word, context, isInsideCalc) ? undefined : word
}

const varViolation = (
  node: valueParser.FunctionNode,
  context: ValueContext,
): string | undefined => {
  const text = valueParser.stringify(node)
  const name = node.nodes.find((inner) => inner.type === 'word')?.value ?? ''
  if (node.nodes.some((inner) => inner.type === 'div' && inner.value === ',')) {
    return ADMITTED_FALLBACKS.includes(text) ? undefined : text
  }
  const isKnown = name.startsWith('--nave-')
    ? context.tokens.has(name)
    : BASE_UI_VARIABLES.has(name)
  return isKnown ? undefined : text
}

const listOf = (violation: string | undefined): string[] =>
  violation === undefined ? [] : [violation]

const nodeViolations = (
  node: valueParser.Node,
  context: ValueContext,
  isInsideCalc: boolean,
): string[] => {
  switch (node.type) {
    case 'div':
    case 'space': {
      return []
    }
    case 'function': {
      return functionViolations(node, context)
    }
    case 'string': {
      return node.value === '' ? [] : [valueParser.stringify(node)]
    }
    case 'word': {
      return listOf(wordViolation(node.value, context, isInsideCalc))
    }
    default: {
      return [valueParser.stringify(node)]
    }
  }
}

const functionViolations = (node: valueParser.FunctionNode, context: ValueContext): string[] => {
  if (node.value === 'var') return listOf(varViolation(node, context))
  if (node.value === 'calc' || node.value === '') {
    return node.nodes.flatMap((inner) => nodeViolations(inner, context, true))
  }
  return [valueParser.stringify(node)]
}

/**
 * The parts of a declared value that are none of the admitted forms.
 */
export const valueViolations = (value: string, context: ValueContext): string[] =>
  valueParser(value).nodes.flatMap((node) => nodeViolations(node, context, false))
