/**
 * Run in a fresh process by `native-order-robustness.test.ts`: expands one rule whose nested
 * selector holds a functional pseudo-class `depth` levels deep through every host and prints what
 * each did as one JSON line. A fresh process matters: the depth at which a stack overflows moves
 * with how warm the process is, so each depth gets one of its own.
 *
 * Usage: node order-depth-probe.ts <not|is> <depth> <scratch directory>
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import postcss from 'postcss'

import { expandText } from '../../src/directive/expand-text.ts'
import { runExpand } from '../../src/expand-command.ts'
import { navePlugin } from '../../src/postcss.ts'

const [fn, depthText, directory] = process.argv.slice(2)
const depth = Number(depthText)
const selector = `&${`:${fn}(`.repeat(depth)}.a${')'.repeat(depth)}`
const css = `.x { @nave focusRing; ${selector} { outline-color: red } }`

interface Seen {
  readonly columns?: number[]
  readonly error?: string
  readonly hasSelector?: boolean
  readonly host: string
  readonly mode: string
}

const seen: Seen[] = []
const modes = ['warn', 'error', 'ignore'] as const

for (const mode of modes) {
  try {
    const result = await postcss([navePlugin({ onUnknown: mode })]).process(css, {
      from: undefined,
    })
    seen.push({
      host: 'postcss',
      mode,
      columns: result.warnings().map((warning) => warning.column),
      hasSelector: result.css.includes(selector),
    })
  } catch (error) {
    seen.push({ host: 'postcss', mode, error: String(error) })
  }
  try {
    const result = expandText(css, { onUnknown: mode })
    seen.push({
      host: 'text',
      mode,
      columns: result.warnings.map((warning) => warning.column),
      hasSelector: result.css.includes(selector),
    })
  } catch (error) {
    seen.push({ host: 'text', mode, error: String(error) })
  }
}

if (directory !== undefined) {
  mkdirSync(directory, { recursive: true })
  const source = path.join(directory, 'in.css')
  const out = path.join(directory, 'out.css')
  writeFileSync(source, css)
  try {
    const status = await runExpand([`--source=${source}`, `--out=${out}`])
    seen.push({
      host: 'expand',
      mode: 'warn',
      columns: [status],
      hasSelector: readFileSync(out, 'utf8').includes(selector),
    })
  } catch (error) {
    seen.push({ host: 'expand', mode: 'warn', error: String(error) })
  }
}

// eslint-disable-next-line no-console -- the one line this script exists to print, read by the test that runs it
console.log(JSON.stringify(seen))
