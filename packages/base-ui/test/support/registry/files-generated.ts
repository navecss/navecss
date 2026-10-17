/**
 * Readings the build scenarios make of a copy's output: a directory as a map of its files' bytes,
 * the statement a part is exported by, and the declarations a class carries in a stylesheet.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import postcss, { type ChildNode, type Container, type Declaration } from 'postcss'

import { foldWhitespace } from './files-sources.ts'

/**
 * Every file of a directory, name to text. Empty when the directory is absent.
 */
export const snapshotOf = (directory: string): Map<string, string> => {
  if (!existsSync(directory)) return new Map()
  const names = readdirSync(directory, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => path.relative(directory, path.join(entry.parentPath, entry.name)))
  return new Map(
    names
      .toSorted((a, b) => a.localeCompare(b))
      .map((name) => [name, readFileSync(path.join(directory, name), 'utf8')]),
  )
}

/**
 * The statement `export const <name>:` through to the next export, whitespace folded.
 */
export const exportStatement = (content: string, name: string): string => {
  const marker = `export const ${name}:`
  const start = content.indexOf(marker)
  if (start === -1) throw new Error(`no ${marker}`)
  const rest = content.slice(start)
  const end = rest.indexOf('\nexport ', marker.length)
  return foldWhitespace(end === -1 ? rest : rest.slice(0, end))
}

const ancestry = (node: ChildNode): string[] => {
  const chain: string[] = []
  let parent: Container | undefined = node.parent
  while (parent !== undefined && parent.type !== 'root') {
    if (parent.type === 'rule') chain.unshift((parent as postcss.Rule).selector)
    if (parent.type === 'atrule' && (parent as postcss.AtRule).name !== 'layer') {
      chain.unshift(`@${(parent as postcss.AtRule).name} ${(parent as postcss.AtRule).params}`)
    }
    parent = parent.parent as Container | undefined
  }
  return chain
}

const isDeclaration = (node: ChildNode): node is Declaration => node.type === 'decl'

/**
 * Every declaration under the rules of a class, as `<at-rules and selectors> { property: value }`,
 * in the stylesheet's order: the outermost rule's selector must begin with the class.
 */
export const declarationsOfClass = (css: string, className: string): string[] => {
  const lines: string[] = []
  const own = new RegExp(String.raw`^\.${className}(?![\w-])`)
  postcss.parse(css).walkDecls((declaration) => {
    if (!isDeclaration(declaration)) return
    const chain = ancestry(declaration)
    const outer = chain.find((entry) => !entry.startsWith('@'))
    if (outer !== undefined && own.test(outer)) {
      lines.push(`${chain.join(' | ')} { ${declaration.prop}: ${declaration.value} }`)
    }
  })
  return lines
}
