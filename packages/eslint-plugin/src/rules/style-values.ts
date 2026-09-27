/**
 * The style rule: a literal value in a JSX `style` object, on a property `@navecss/
 * stylelint-config`'s own property list already tokenizes, is reported unless that list's
 * allowlist semantics admit it (a `var()`, a function consuming one, an admitted keyword, a
 * CSS-wide keyword, or, for numbers, an implied `px` matching the property's admitted keyword
 * set). A number literal includes one written with a unary `-` or `+`: a signed constant is
 * written in the source, not computed at run time, so `margin: -8` compares as `-8px` the same
 * way stylelint compares it. A value computed at run time otherwise (an identifier, a call, a
 * template literal with an expression) always passes: this rule reads literal JSX syntax only,
 * the same floor rule 1 holds for `className`. A key whose own CSS name is not itself on that
 * property list, including every shorthand not expanded into its longhands (`background`,
 * `border` and its sides, `font`, `transition`, `animation`, and any other), passes unchecked:
 * that expansion lives inside stylelint's own config, which this package does not depend on.
 */
import type { TSESTree } from '@typescript-eslint/types'
import type { JSSyntaxElement, Rule } from 'eslint'

import valueParser from 'postcss-value-parser'

import {
  type CompiledStyleEntry,
  cssPropertyName,
  findEntry,
  renderNumericValue,
} from '../style-rule-data.ts'

/**
 * Whether-admits, matching stylelint's own handling of a multi-part value on a listed property
 * (that config's README: "each space-separated part of a value is checked on its own", and a
 * comma list, `font-family`'s, treated the same way): every top-level word/function part must be
 * admitted on its own for the whole value to pass, so `margin: '0 auto'` passes (both parts
 * admitted) while a single bad part anywhere reports the whole literal. This governs a listed
 * property's own value only; it never expands a shorthand property into the longhands it sets.
 */
function isValueAdmitted(entry: CompiledStyleEntry, text: string): boolean {
  const parsed = valueParser(text)
  const parts = parsed.nodes.filter((node) => node.type !== 'space' && node.type !== 'div')
  if (parts.length === 0) return entry.admits(text)
  return parts.every((part) => entry.admits(valueParser.stringify(part)))
}

/**
A plain identifier key (`padding:`) or a string-literal key (`'padding':`); else `undefined`.
 */
function propertyKeyName(property: TSESTree.Property): string | undefined {
  if (property.key.type === 'Identifier') return property.key.name
  if (property.key.type === 'Literal' && typeof property.key.value === 'string')
    return property.key.value
  return undefined
}

/**
A number literal, including one written with a leading unary `-` or `+`: a signed constant is
written in the source, not computed at run time, so it is compared the same way stylelint
compares it (`margin: -8` as `-8px`, `zIndex: -1` as `-1`).
 */
function numericLiteralValue(value: TSESTree.Node): number | undefined {
  if (value.type === 'Literal' && typeof value.value === 'number') return value.value
  if (
    value.type === 'UnaryExpression' &&
    (value.operator === '-' || value.operator === '+') &&
    value.argument.type === 'Literal' &&
    typeof value.argument.value === 'number'
  ) {
    return value.operator === '-' ? -value.argument.value : value.argument.value
  }
  return undefined
}

/**
 *
 */
function literalValueText(value: TSESTree.Node): string | undefined {
  if (value.type === 'Literal' && typeof value.value === 'string') return value.value
  if (value.type === 'TemplateLiteral' && value.expressions.length === 0) {
    return value.quasis[0]!.value.cooked ?? value.quasis[0]!.value.raw
  }
  return undefined
}

/**
 *
 */
function checkProperty(
  context: Rule.RuleContext,
  property: TSESTree.Property,
  keyName: string,
): void {
  if (keyName.startsWith('--')) return // a custom property: a lawful per-instance override

  const cssName = cssPropertyName(keyName)
  const entry = findEntry(cssName)
  if (!entry) return

  const value = property.value as TSESTree.Node

  const numeric = numericLiteralValue(value)
  if (numeric !== undefined) {
    const rendered = renderNumericValue(cssName, numeric)
    if (!isValueAdmitted(entry, rendered)) reportLiteral(context, property)
    return
  }

  const text = literalValueText(value)
  if (text === undefined) return // computed at run time: pass
  if (!isValueAdmitted(entry, text)) reportLiteral(context, property)
}

/**
Reports `property`, quoting its declaration exactly as written in the source (the key and the
value as authored), never a rendered comparison value.
 */
function reportLiteral(context: Rule.RuleContext, property: TSESTree.Property): void {
  const declaration = context.sourceCode.getText(property as never)
  context.report({
    node: property as unknown as JSSyntaxElement,
    message: `"${declaration}" is a literal value on a property this design system tokenizes. Move the declaration to the component's CSS with a var(--nave-*) value, or set a custom property inline and read it in CSS.`,
  })
}

export const styleValuesRule: Rule.RuleModule = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'A literal value in a JSX style object, on a property the design system tokenizes.',
      url: 'https://github.com/navecss/navecss/tree/main/packages/eslint-plugin#rule-style',
    },
    schema: [],
  },
  create(context) {
    return {
      'JSXAttribute[name.name="style"] JSXExpressionContainer > ObjectExpression'(
        node: JSSyntaxElement,
      ) {
        const object = node as unknown as TSESTree.ObjectExpression
        for (const property of object.properties) {
          if (property.type !== 'Property' || property.computed) continue
          const keyName = propertyKeyName(property)
          if (keyName) checkProperty(context, property, keyName)
        }
      },
    }
  },
}
