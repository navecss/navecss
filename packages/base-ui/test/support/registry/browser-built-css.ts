/**
 * Reading a stylesheet the way the engine does, for the criterion about what a build kept: the rules
 * of a sheet flattened into (layer path, media path, selector, declarations) whatever their form
 * (nested, or lowered by a minifier to flat rules), declarations read longhand and canonical from
 * the engine's own serialisation, and the order in which a sheet first names its layers.
 */

export interface Fact {
  readonly declarations: ReadonlyMap<string, string>
  readonly layers: readonly string[]
  readonly media: readonly string[]
  readonly selector: string
}

interface Context {
  readonly layers: readonly string[]
  readonly media: readonly string[]
  readonly parents: readonly string[] | undefined
}

const splitList = (list: string): string[] => {
  const parts: string[] = []
  let depth = 0
  let start = 0
  for (let index = 0; index < list.length; index += 1) {
    const char = list[index]
    if (char === '(' || char === '[') depth += 1
    else if (char === ')' || char === ']') depth -= 1
    else if (char === ',' && depth === 0) {
      parts.push(list.slice(start, index).trim())
      start = index + 1
    }
  }
  parts.push(list.slice(start).trim())
  return parts
}

const resolve = (parents: readonly string[] | undefined, list: string): string[] =>
  splitList(list).flatMap((own) =>
    parents === undefined
      ? [own]
      : parents.map((parent) =>
          own.includes('&') ? own.replaceAll('&', () => parent) : `${parent} ${own}`,
        ),
  )

/**
A value with the spacing a minifier is free to change taken out: a value holding `var()` is kept as
written, so `var(--x, 2px)` and `var(--x,2px)` are the same value.
 */
const compact = (value: string): string =>
  value
    .replaceAll(/\s+/g, ' ')
    .replaceAll(/\s*,\s*/g, ',')
    .trim()

const declarationsOf = (style: CSSStyleDeclaration): Map<string, string> => {
  const found = new Map<string, string>()
  for (const name of style) {
    const important = style.getPropertyPriority(name) === 'important' ? ' !important' : ''
    found.set(name, `${compact(style.getPropertyValue(name))}${important}`)
  }
  return found
}

const isNestedDeclarations = (rule: CSSRule): rule is CSSRule & { style: CSSStyleDeclaration } =>
  'CSSNestedDeclarations' in globalThis && rule.constructor.name === 'CSSNestedDeclarations'

const collect = (rules: CSSRuleList, context: Context, found: Fact[]): void => {
  for (const rule of rules) {
    if (rule instanceof CSSLayerBlockRule) {
      collect(rule.cssRules, { ...context, layers: [...context.layers, rule.name] }, found)
    } else if (rule instanceof CSSMediaRule) {
      collect(rule.cssRules, { ...context, media: [...context.media, rule.conditionText] }, found)
    } else if (rule instanceof CSSStyleRule) {
      const selectors = resolve(context.parents, rule.selectorText)
      for (const selector of selectors) {
        found.push({
          declarations: declarationsOf(rule.style),
          layers: context.layers,
          media: context.media,
          selector,
        })
      }
      collect(rule.cssRules, { ...context, parents: selectors }, found)
    } else if (isNestedDeclarations(rule)) {
      const owners = context.parents ?? []
      for (const selector of owners) {
        found.push({
          declarations: declarationsOf(rule.style),
          layers: context.layers,
          media: context.media,
          selector,
        })
      }
    }
  }
}

/**
Parses a stylesheet without putting it in the document.
 */
export const parseSheet = (css: string): CSSStyleSheet => {
  const sheet = new CSSStyleSheet()
  sheet.replaceSync(css)
  return sheet
}

/**
Every rule of the sheet, one fact per selector, in document order.
 */
export const factsOf = (css: string): Fact[] => {
  const found: Fact[] = []
  collect(parseSheet(css).cssRules, { layers: [], media: [], parents: undefined }, found)
  return found
}

const collectLayers = (rules: CSSRuleList, prefix: string, found: string[]): void => {
  for (const rule of rules) {
    if (rule instanceof CSSLayerStatementRule) {
      found.push(...rule.nameList.map((name) => `${prefix}${name}`))
    } else if (rule instanceof CSSLayerBlockRule) {
      const name = `${prefix}${rule.name}`
      found.push(name)
      collectLayers(rule.cssRules, `${name}.`, found)
    } else if ('cssRules' in rule) {
      collectLayers(rule.cssRules as CSSRuleList, prefix, found)
    }
  }
}

/**
The layers a sheet names, in the order it first names each: statements and blocks alike, so a
statement the minifier rewrote into blocks and shorter statements reads the same.
 */
export const layersInOrder = (css: string): string[] => {
  const named: string[] = []
  collectLayers(parseSheet(css).cssRules, '', named)
  return [...new Set(named)]
}

const scopedClass = (local: string): RegExp =>
  new RegExp(String.raw`\._${local}_[A-Za-z0-9]+(?:_\d+)?(?![\w-])`, 'g')

/**
The selector with the class a CSS Module scoped back to its local name: `._button_ob86x_36` is
`.button`.
 */
export const localized = (selector: string, locals: readonly string[]): string =>
  locals.reduce((text, local) => text.replaceAll(scopedClass(local), () => `.${local}`), selector)

/**
The classes a stylesheet scopes for one local name.
 */
export const hashedClasses = (css: string, local: string): string[] =>
  new Set(css.matchAll(scopedClass(local)).map(([name]) => name)).values().toArray()
