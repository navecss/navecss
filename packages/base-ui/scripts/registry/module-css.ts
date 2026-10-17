/**
 * The CSS Module of one item: Nave's layer order statement, then `@layer components.consumer`
 * carrying the rules the package stylesheet carries for the atoms the item's parts use, in the
 * stylesheet's order, with each class renamed to the atom's local name. The rules are expanded
 * through core's PostCSS adapter exactly as `build-styles.ts` expands them, then laid out one
 * declaration per line by Prettier, so a line-based disable comment covers what it names.
 */
import type { AtomDefinition } from '@navecss/core/atoms'

import { navePlugin } from '@navecss/core/postcss'
import postcss, { type Declaration, type Rule } from 'postcss'
import { format } from 'prettier'

import { RegistryBuildError } from './errors.ts'

/**
 * The comment that precedes each `outline: none` a focusable atom carries, alone on its line.
 */
export const OUTLINE_COMMENT =
  "/* stylelint-disable-next-line declaration-property-value-disallowed-list -- the outline the &:focus-visible rule in this block draws replaces the browser's default focus indicator; keep that rule while this declaration stays. */"

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

const isRing = (node: { selector?: string; type: string }): boolean =>
  node.type === 'rule' && node.selector === '&:focus-visible'

const drawsRing = (rule: Rule, after: Declaration): boolean => {
  const index = rule.index(after)
  return rule.nodes
    .slice(index + 1)
    .some(
      (node) =>
        isRing(node) &&
        node.type === 'rule' &&
        node.nodes.some(
          (child) =>
            child.type === 'decl' && child.prop === 'outline-style' && child.value === 'solid',
        ),
    )
}

/**
 * Puts the disable comment before each `outline: none` whose rule draws a ring after it, and
 * refuses any other `outline: none` and every `outline: 0`.
 */
const guardOutlines = (root: postcss.Root, atomOf: ReadonlyMap<string, string>): void => {
  const comment = OUTLINE_COMMENT.slice(3, -3)
  root.walkDecls('outline', (declaration) => {
    const rule = declaration.parent as Rule
    const atom = atomOf.get(rule.selector.replace(/^\./, '')) ?? rule.selector
    const value = declaration.value.trim()
    if (value === 'none' && declaration.parent?.type === 'rule' && drawsRing(rule, declaration)) {
      declaration.before(postcss.comment({ raws: { before: '\n    ' }, text: comment }))
      return
    }
    throw new RegistryBuildError(
      `${atom} has "outline: ${value}" that no &:focus-visible rule after it draws a ring for`,
      { file: 'module.css' },
    )
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
