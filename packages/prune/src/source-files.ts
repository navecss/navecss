/**
 * Which files the graph reads as code and which it only notes.
 */
import path from 'node:path'

const SOURCE_EXTENSIONS = new Set(['.cjs', '.cts', '.js', '.jsx', '.mjs', '.mts', '.ts', '.tsx'])
const MARKDOWN_EXTENSIONS = new Set(['.md', '.mdx'])
const STYLESHEET_EXTENSIONS = new Set(['.css', '.sass', '.scss'])

/**
 * Whether the file is JavaScript or TypeScript, which the graph parses.
 */
export function isSourceFile(file: string): boolean {
  return SOURCE_EXTENSIONS.has(path.extname(file)) && !file.endsWith('.d.ts')
}

/**
 * Whether the file is Markdown or MDX, which the graph does not read and names.
 */
export function isMarkdownFile(file: string): boolean {
  return MARKDOWN_EXTENSIONS.has(path.extname(file))
}

/**
 * Whether the file is a stylesheet Next.js runs PostCSS over.
 */
export function isStylesheetFile(file: string): boolean {
  return STYLESHEET_EXTENSIONS.has(path.extname(file))
}

/**
 * Whether the path lies under a `node_modules` directory.
 */
export function isDependencyPath(file: string): boolean {
  return file.split(path.sep).includes('node_modules')
}

/**
 * The path relative to `dir` with forward slashes, `../` included for a file outside it.
 */
export function relativeTo(dir: string, file: string): string {
  return path.relative(dir, file).split(path.sep).join('/')
}

/**
 * Whether `file` lies inside `root`, or is `root`.
 */
export function isInside(root: string, file: string): boolean {
  const relative = path.relative(root, file)
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative))
}
