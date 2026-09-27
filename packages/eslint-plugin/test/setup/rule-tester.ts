/**
 * Registers ESLint's documented test-framework integration for RuleTester:
 * https://eslint.org/docs/latest/integrate/nodejs-api#customizing-ruletester
 *
 * With `describe`/`it` assigned here, `ruleTester.run(...)` creates one real vitest `describe`
 * per rule and one `it` per valid/invalid case, each with its own assertion. Every
 * `ruleTester.run(...)` call in this package's tests is made directly inside a `describe` (or at
 * module scope), never inside an `it()`, so a coverage tool sees the case-level assertions
 * RuleTester makes instead of one opaque `it()` that merely calls into it.
 */
import { RuleTester } from 'eslint'
import { describe, it } from 'vitest'

RuleTester.describe = describe
RuleTester.it = it
RuleTester.itOnly = it.only
