/**
 * Writing the registry's copies to disk as the source files they are, so the dev server can serve
 * them, and the variants of the Dialog copy the browser criteria's controls need. Every edit is made
 * to a copy of an item's served content in a gitignored folder; nothing in the registry is changed.
 */
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import postcss, { type Declaration, type Root, type Rule } from 'postcss'

import { PACKAGE_DIR } from '../stylesheet.ts'
import { FIXTURES_FOLDER, type VariantName, VARIANTS } from './browser-paths.ts'
import { fileOf, type LoadedRegistry, type RegistryItem } from './load.ts'

export const FIXTURES = path.join(PACKAGE_DIR, FIXTURES_FOLDER)
const COPIES = path.join(FIXTURES, 'registry-copies')

const baseName = (target: string): string => path.posix.basename(target)

/**
The file name of an item's CSS Module: `nave-dialog.module.css` for `base-ui-dialog`.
 */
export const moduleName = (item: RegistryItem): string =>
  `${item.name.replace('base-ui-', 'nave-')}.module.css`

/**
Writes an item's files into a folder under their own names, any of them replaced by the given text.
 */
export const writeFolder = (
  item: RegistryItem,
  folder: string,
  replaced: Readonly<Record<string, string>> = {},
): void => {
  mkdirSync(folder, { recursive: true })
  for (const file of item.files) {
    const name = baseName(file.target)
    writeFileSync(path.join(folder, name), replaced[name] ?? file.content ?? '')
  }
}

const ruleOf = (root: Root, local: string): Rule => {
  let found: Rule | undefined
  root.walkRules(`.${local}`, (rule) => {
    found ??= rule
  })
  if (found === undefined) throw new Error(`the module has no rule for .${local}`)
  return found
}

const declarationOf = (rule: Rule, property: string): Declaration => {
  const found = rule.nodes.find((node) => node.type === 'decl' && node.prop === property)
  if (found?.type !== 'decl') throw new Error(`${rule.selector} has no ${property}`)
  return found
}

const NEW_BACKGROUND = 'rgb(4, 5, 6)'

const editPopup = (css: string): string => {
  const root = postcss.parse(css)
  declarationOf(ruleOf(root, 'dialogPopup'), 'background-color').value = NEW_BACKGROUND
  return root.toString()
}

const editButton = (css: string): string => {
  const root = postcss.parse(css)
  const rule = ruleOf(root, 'button')
  declarationOf(rule, 'background-color').value = NEW_BACKGROUND
  rule.walkDecls(/^border/, (declaration) => {
    if (declaration.parent === rule) declaration.remove()
  })
  return root.toString()
}

const dropOrderStatement = (css: string): string => {
  const root = postcss.parse(css)
  const statement = root.nodes.find(
    (node) => node.type === 'atrule' && node.name === 'layer' && node.nodes === undefined,
  )
  if (statement === undefined) throw new Error('the module has no layer order statement')
  statement.remove()
  return root.toString()
}

/**
The module with every reduced-motion block removed, wherever it is nested.
 */
export const withoutGuards = (css: string): string => {
  const root = postcss.parse(css)
  root.walkAtRules('media', (node) => {
    if (node.params.includes('prefers-reduced-motion')) node.remove()
  })
  return root.toString()
}

const VARIANT_EDITS: Readonly<Record<VariantName, (css: string) => string>> = {
  editedButton: editButton,
  editedPopup: editPopup,
  noOrderStatement: dropOrderStatement,
}

const writeVariants = (dialog: RegistryItem): void => {
  const module = moduleName(dialog)
  for (const [name, edit] of Object.entries(VARIANT_EDITS) as [VariantName, typeof editPopup][]) {
    writeFolder(dialog, path.join(COPIES, VARIANTS[name]), {
      [module]: edit(fileOf(dialog, module)),
    })
  }
}

/**
Writes every item to its own folder, and the variants of the Dialog copy beside them. The folder is
emptied first, so a dropped item leaves nothing behind.
 */
export const writeCopies = (registry: LoadedRegistry): void => {
  rmSync(COPIES, { force: true, recursive: true })
  for (const item of registry.items.values()) writeFolder(item, path.join(COPIES, item.name))
  const dialog = registry.items.get('base-ui-dialog')
  if (dialog === undefined) throw new Error('the registry has no base-ui-dialog item')
  writeVariants(dialog)
}
