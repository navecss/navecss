/**
 * Run in a fresh process by `native-order-robustness.test.ts`: expands one rule that holds `size`
 * nested rules with a directive and `size` nested rules that override it, and prints the number of
 * warnings as one JSON line. A fresh process matters: a check that spends memory in proportion to
 * the square of the pairs ends a process of its own with the heap exhausted.
 *
 * Usage: node order-scale-probe.ts <size>
 */
import { expandText } from '../../src/directive/expand-text.ts'

const size = Number(process.argv[2])
const directives = Array.from({ length: size }, (_, i) => `&.a${i} { @nave hideDesktopUp }`)
const overrides = Array.from({ length: size }, (_, i) => `&.b${i} { display: flex }`)
const result = expandText(`.x { ${directives.join(' ')} ${overrides.join(' ')} }`, {
  onUnknown: 'ignore',
})

// eslint-disable-next-line no-console -- the one line this script exists to print, read by the test that runs it
console.log(JSON.stringify({ warnings: result.warnings.length }))
