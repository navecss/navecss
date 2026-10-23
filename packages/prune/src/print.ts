/**
 * What the package prints: one line per message, once, from one compilation only. webpack runs
 * the plugin in several compilations, and Turbopack and the dev server run it again on every
 * edit; a message that stays true is said once.
 */
const printed = new Set<string>()

/**
 * Whether this compilation prints: Next.js names the client one, or none (Turbopack).
 */
export function isPrintingCompilation(): boolean {
  // eslint-disable-next-line turbo/no-undeclared-env-vars -- set by Next.js in the process that runs the plugin, not a build input
  const name = process.env.NEXT_COMPILER_NAME
  return name === undefined || name === 'client'
}

/**
 * Prints `line` through `console.warn`, once per `key`.
 */
export function printOnce(key: string, line: string): void {
  if (!isPrintingCompilation() || printed.has(key)) return
  printed.add(key)
  // eslint-disable-next-line no-console -- printing to the terminal running Next.js is this package's output
  console.warn(line)
}

/**
 * Prints `line` through `console.warn` on every run: for what went wrong in this run, which a
 * later run may or may not repeat.
 */
export function printEachRun(line: string): void {
  if (!isPrintingCompilation()) return
  // eslint-disable-next-line no-console -- printing to the terminal running Next.js is this package's output
  console.warn(line)
}

/**
 * Prints `text` through `console.error` on every run, from the compilation that prints.
 */
export function printError(text: string): void {
  if (!isPrintingCompilation()) return
  // eslint-disable-next-line no-console -- printing to the terminal running Next.js is this package's output
  console.error(text)
}
