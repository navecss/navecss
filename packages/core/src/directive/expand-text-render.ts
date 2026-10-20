/**
 * Renders `planRule()`'s emissions into the CSS
 * text `expandText()` splices in — split out of `expand-text.ts` to keep
 * that file under the project's file-length lint.
 */
import type { AnchoredBlock, Declaration } from './plan.ts'
import type { Emission } from './rule-model.ts'

/**
 * Every line terminator (a CRLF pair as one) becomes a single space: an
 * `extend` declaration value is free to carry one (`grid-template-areas`'s
 * multi-row string is the shipped example), but inserted text must never
 * contain one — an untouched byte's line number would otherwise shift
 * by however many an inserted value happened to add.
 */
function withoutLineTerminators(value: string): string {
  return value.replaceAll(/\r\n|[\r\n\f]/g, ' ')
}

/**
 *
 */
function renderDeclarations(decls: readonly Declaration[]): string {
  return decls.map((d) => `${d.prop}: ${withoutLineTerminators(d.value)}`).join('; ')
}

/**
 *
 */
function renderRule(selector: string, decls: readonly Declaration[]): string {
  return `${selector} { ${renderDeclarations(decls)} }`
}

/**
 *
 */
function renderBlock(block: AnchoredBlock): string {
  if (block.kind === 'pseudo') return renderRule(block.selector, block.declarations)
  const inner: string[] = []
  if (block.declarations.length > 0) inner.push(renderRule('&', block.declarations))
  for (const pseudo of block.pseudos) inner.push(renderRule(pseudo.selector, pseudo.declarations))
  return `@${block.kind} ${block.condition} { ${inner.join(' ')} }`
}

/**
 * The text a directive's emissions stand for, on one line: bare declarations each ended by `;`,
 * wrapped declarations inside `& { }`, and each block as a rule or at-rule.
 */
export function renderEmissions(emissions: readonly Emission[]): string {
  return emissions
    .map((emission) => {
      if (emission.kind === 'block') return renderBlock(emission.block)
      if (emission.isWrapped) return renderRule('&', emission.declarations)
      return `${renderDeclarations(emission.declarations)};`
    })
    .join(' ')
}
