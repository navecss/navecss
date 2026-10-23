/**
 * The CSS Module of one item: Nave's layer order statement, then `@layer components.consumer`
 * carrying the rules the package stylesheet carries for the atoms the item's parts use, in the
 * stylesheet's order, with each class renamed to the atom's local name. The rules are expanded
 * through core's PostCSS adapter exactly as `build-styles.ts` expands them, then laid out one
 * declaration per line by Prettier, so a line-based disable comment covers what it names.
 */
import type { AtomDefinition } from '@navecss/core/atoms'

import { navePlugin } from '@navecss/core/postcss'
import postcss, { type ChildNode, type Declaration, type Rule } from 'postcss'
import { format } from 'prettier'

import { RegistryBuildError } from './errors.ts'

/**
 * The comment that precedes each `outline: none` a focusable atom carries, alone on its line. It is
 * written only where `guardOutlines` has found the `&:focus-visible` rule that draws the ring.
 */
export const OUTLINE_COMMENT =
  "/* stylelint-disable-next-line declaration-property-value-disallowed-list -- the outline the &:focus-visible rule for this class draws replaces the browser's default focus indicator; keep that rule while this declaration stays. */"

/**
 * An atom's name as the class it is in a copy: the name minus `baseUi`, first letter lower-cased.
 */
export const localName = (atom: string): string =>
  atom.replace(/^baseUi/, '').replace(/^./, (letter) => letter.toLowerCase())

export interface ModuleInputs {
  readonly atoms: Readonly<Record<string, AtomDefinition>>
  readonly focusRingAtoms: readonly string[]
  readonly orderStatement: string
  /**
  The atoms this item's parts use.
   */
  readonly used: ReadonlySet<string>
}

const directive = (name: string, focusRingAtoms: readonly string[]): string =>
  focusRingAtoms.includes(name) ? `${name} focusRing` : name

const RING_LONGHANDS = ['outline-width', 'outline-color', 'outline-offset']

const hasDeclaration = (rule: Rule, property: string, value?: string): boolean =>
  rule.nodes.some(
    (node) =>
      node.type === 'decl' &&
      node.prop === property &&
      (value === undefined || node.value === value),
  )

const isRingRule = (node: ChildNode): boolean =>
  node.type === 'rule' &&
  node.selector === '&:focus-visible' &&
  hasDeclaration(node, 'outline-style', 'solid') &&
  RING_LONGHANDS.every((property) => hasDeclaration(node, property))

const isClassRule = (rule: Rule): boolean =>
  rule.selector.startsWith('.') && rule.parent?.type === 'atrule'

/**
 * The outermost rule around a declaration: the atom's class rule.
 */
const classRuleOf = (declaration: Declaration): Rule | undefined => {
  let found: Rule | undefined
  let current: postcss.Container | postcss.Document | undefined = declaration.parent
  while (current !== undefined && current.type !== 'root') {
    if (current.type === 'rule') found = current as Rule
    current = current.parent
  }
  return found
}

/**
 * The node of the class rule that holds the declaration, when the declaration sits directly in the
 * class rule or is the only declaration of a `&` rule directly in it.
 */
const holderOf = (declaration: Declaration, classRule: Rule): ChildNode | undefined => {
  const parent = declaration.parent
  if (parent === classRule) return declaration
  const isAlone =
    parent?.type === 'rule' &&
    parent.selector === '&' &&
    parent.parent === classRule &&
    parent.nodes.length === 1
  return isAlone ? parent : undefined
}

const isPaired = (declaration: Declaration): boolean => {
  const classRule = classRuleOf(declaration)
  if (classRule === undefined || !isClassRule(classRule)) return false
  const holder = holderOf(declaration, classRule)
  return (
    holder !== undefined &&
    classRule.nodes.slice(classRule.index(holder) + 1).some((node) => isRingRule(node))
  )
}

const shown = (declaration: Declaration): string =>
  `${declaration.prop}: ${declaration.value}${declaration.important ? ' !important' : ''}`

const REMOVING_STYLES = /^(?:none|initial|unset)$/i

/**
 * Refuses an `outline-style` of `none`, `initial` or `unset`, in any rule or at-rule, whether or
 * not it is `!important`: each removes the focus indicator, and no comment is ever written for
 * one. Every other `outline-style` passes.
 */
const refuseRemovedStyle = (declaration: Declaration, atom: string): void => {
  if (!REMOVING_STYLES.test(declaration.value)) return
  throw new RegistryBuildError(
    `${atom} has "${shown(declaration)}": an outline-style of none, initial or unset removes ` +
      'the focus indicator, so it is refused',
    { file: 'module.css' },
  )
}

/**
 * Puts the disable comment before an `outline: none` that is paired with the ring that replaces
 * it, and refuses any other `outline` shorthand, naming the atom. An `outline: none` is paired when
 * it is a lowercase `none` without `!important`, sits directly in the atom's class rule or alone in
 * a `&` rule directly in it, and the class rule has an `&:focus-visible` rule after it that sets
 * `outline-style: solid`, `outline-width`, `outline-color` and `outline-offset`.
 */
const guardShorthand = (declaration: Declaration, atom: string): void => {
  if (declaration.important) {
    throw new RegistryBuildError(
      `${atom} has "${shown(declaration)}": !important beats the focus ring, so it is refused`,
      { file: 'module.css' },
    )
  }
  const isNone = declaration.prop === 'outline' && declaration.value === 'none'
  if (isNone && isPaired(declaration)) {
    const comment = OUTLINE_COMMENT.slice(3, -3)
    declaration.before(postcss.comment({ raws: { before: '\n    ' }, text: comment }))
    return
  }
  const found = `${atom} has "${shown(declaration)}"`
  const accepted =
    'the only outline accepted is a lowercase "outline: none", directly in the atom\'s rule ' +
    'or alone in a "&" rule there, followed by a "&:focus-visible" rule that sets ' +
    'outline-style: solid, outline-width, outline-color and outline-offset'
  throw new RegistryBuildError(
    isNone
      ? `${found} with no &:focus-visible ring paired to it: ${accepted}`
      : `${found}: ${accepted}`,
    { file: 'module.css' },
  )
}

/**
 * Guards every outline in the module: the `outline` shorthand through `guardShorthand`, and an
 * `outline-style` of `none`, `initial` or `unset`, which is refused.
 */
const guardOutlines = (root: postcss.Root, atomOf: ReadonlyMap<string, string>): void => {
  root.walkDecls(/^outline(?:-style)?$/i, (declaration) => {
    const named = classRuleOf(declaration)?.selector ?? (declaration.parent as Rule).selector
    const atom = atomOf.get(named.replace(/^\./, '')) ?? named
    if (declaration.prop.toLowerCase() === 'outline-style') refuseRemovedStyle(declaration, atom)
    else guardShorthand(declaration, atom)
  })
}

const sourceOf = ({ atoms, focusRingAtoms, orderStatement, used }: ModuleInputs): string => {
  const rules = Object.keys(atoms)
    .filter((name) => used.has(name))
    .map((name) => `  .${localName(name)} { @nave ${directive(name, focusRingAtoms)}; }`)
  return `${orderStatement}\n\n@layer components.consumer {\n${rules.join('\n')}\n}\n`
}

/**
 * The module's text after the header: the order statement and the layer block.
 */
export const moduleBody = async (inputs: ModuleInputs): Promise<string> => {
  const atomOf = new Map([...inputs.used].map((name) => [localName(name), name]))
  const result = await postcss([navePlugin({ extend: inputs.atoms })]).process(sourceOf(inputs), {
    from: undefined,
  })
  const root = postcss.parse(result.css)
  guardOutlines(root, atomOf)
  return format(root.toString(), { parser: 'css' })
}
