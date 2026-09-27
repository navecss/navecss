/**
 * Renders `plan()`'s already-anchored declarations and blocks into the CSS
 * text `expandText()` splices in — split out of `expand-text.ts` to keep
 * that file under the project's file-length lint.
 */
import type { AnchoredBlock, Declaration } from './plan.ts'

/**
 * Every line terminator (a CRLF pair as one) becomes a single space: an
 * `extend` declaration value is free to carry one (`grid-template-areas`'s
 * multi-row string is the shipped example), but inserted text must never
 * contain one (R3) — an untouched byte's line number would otherwise shift
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
export function renderBlock(block: AnchoredBlock): string {
  if (block.kind === 'pseudo') return renderRule(block.selector, block.declarations)
  const inner: string[] = []
  if (block.declarations.length > 0) inner.push(renderRule('&', block.declarations))
  for (const pseudo of block.pseudos) inner.push(renderRule(pseudo.selector, pseudo.declarations))
  return `@${block.kind} ${block.condition} { ${inner.join(' ')} }`
}

/**
 *
 */
export function renderInline(declarations: readonly Declaration[], isWrapped: boolean): string {
  if (declarations.length === 0) return ''
  if (isWrapped) return renderRule('&', declarations)
  return `${renderDeclarations(declarations)};`
}
