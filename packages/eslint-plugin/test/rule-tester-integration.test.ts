/**
 * Guards the RuleTester / vitest wiring set up in test/setup/rule-tester.ts: a `ruleTester.run(
 * ...)` call must sit directly inside a `describe` (or at module scope), never inside an
 * `it()`/`test()` callback. Wrapped that way, RuleTester's own per-case assertions run invisibly
 * to a coverage or static-analysis tool that only sees the outer callback, which is exactly what
 * flagged every case in this package's rule suites before this file's siblings were restructured.
 *
 * A `ruleTester.run(...)` call reached only through a further function literal defined inside the
 * `it()`/`test()` body (for example a `run` variable later passed to `expect(run).toThrow(...)`,
 * used to assert that a bad option throws) is not this problem: the call is deferred to be
 * invoked by an assertion the tool can already see, so the scan below does not flag it.
 */
import type {
  ArrowFunction,
  CallExpression,
  Expression,
  FunctionExpression,
  Node,
  SourceFile,
} from 'typescript'

import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import {
  createSourceFile,
  forEachChild,
  isArrowFunction,
  isCallExpression,
  isFunctionExpression,
  isIdentifier,
  isNewExpression,
  isPropertyAccessExpression,
  isStringLiteralLike,
  isVariableDeclaration,
  ScriptKind,
  ScriptTarget,
} from 'typescript'
import { describe, expect, it } from 'vitest'

const TEST_DIR = import.meta.dirname

interface Violation {
  file: string
  line: number
  testName: string
}

/**
 * Every local variable in `sourceFile` initialised with `new RuleTester(...)`.
 */
function ruleTesterVariableNames(sourceFile: SourceFile): Set<string> {
  const names = new Set<string>()
  function visit(node: Node): void {
    if (
      isVariableDeclaration(node) &&
      isIdentifier(node.name) &&
      node.initializer &&
      isNewExpression(node.initializer) &&
      isIdentifier(node.initializer.expression) &&
      node.initializer.expression.text === 'RuleTester'
    ) {
      names.add(node.name.text)
    }
    forEachChild(node, visit)
  }
  visit(sourceFile)
  return names
}

/**
 * The `it`/`test` a call expression ultimately calls, unwrapping `.each(...)` and `.only`/`.skip`.
 */
function calleeRootName(expr: Expression): string | undefined {
  let current: Expression = expr
  for (;;) {
    if (isIdentifier(current)) return current.text
    if (isPropertyAccessExpression(current)) {
      current = current.expression
      continue
    }
    if (isCallExpression(current)) {
      current = current.expression
      continue
    }
    return undefined
  }
}

function testCaseCallback(node: Node): ArrowFunction | FunctionExpression | undefined {
  if (!isCallExpression(node)) return undefined
  const root = calleeRootName(node.expression)
  if (root !== 'it' && root !== 'test') return undefined
  const last = node.arguments.at(-1)
  if (last && (isArrowFunction(last) || isFunctionExpression(last))) return last
  return undefined
}

/**
 * The first `<ruleTesterName>.run(...)` call reachable from `body` without crossing into a
 * further nested function expression or arrow function: that boundary is the exemption above.
 */
function directRunCall(body: Node, ruleTesterNames: Set<string>): CallExpression | undefined {
  let found: CallExpression | undefined
  function visit(node: Node): void {
    if (found) return
    if (isFunctionExpression(node) || isArrowFunction(node)) return
    if (
      isCallExpression(node) &&
      isPropertyAccessExpression(node.expression) &&
      node.expression.name.text === 'run' &&
      isIdentifier(node.expression.expression) &&
      ruleTesterNames.has(node.expression.expression.text)
    ) {
      found = node
      return
    }
    forEachChild(node, visit)
  }
  visit(body)
  return found
}

function findViolations(sourceText: string, fileName: string): Violation[] {
  const sourceFile = createSourceFile(
    fileName,
    sourceText,
    ScriptTarget.Latest,
    true,
    ScriptKind.TS,
  )
  const ruleTesterNames = ruleTesterVariableNames(sourceFile)
  const violations: Violation[] = []

  function visit(node: Node): void {
    const callback = testCaseCallback(node)
    if (callback && isCallExpression(node)) {
      const call = directRunCall(callback.body, ruleTesterNames)
      if (call) {
        const { line } = sourceFile.getLineAndCharacterOfPosition(call.getStart(sourceFile))
        const nameArg = node.arguments.find((argument) => isStringLiteralLike(argument))
        violations.push({
          file: fileName,
          line: line + 1,
          testName: nameArg ? nameArg.text : '(unnamed)',
        })
      }
    }
    forEachChild(node, visit)
  }

  visit(sourceFile)
  return violations
}

function realTestFiles(): string[] {
  return readdirSync(TEST_DIR)
    .filter((name) => name.endsWith('.test.ts'))
    .toSorted((a, b) => a.localeCompare(b))
}

describe('every ruleTester.run(...) call sits in a describe, not an it()/test()', () => {
  for (const name of realTestFiles()) {
    it(`${name} has no ruleTester.run(...) call wrapped in it()/test()`, () => {
      const filePath = path.join(TEST_DIR, name)
      const source = readFileSync(filePath, 'utf8')
      expect(findViolations(source, filePath)).toEqual([])
    })
  }
})

describe('the scanner itself', () => {
  it('flags a ruleTester.run(...) call made directly inside an it() (control case)', () => {
    const source = `
      import { RuleTester } from 'eslint'
      import { describe, it } from 'vitest'
      const ruleTester = new RuleTester()
      describe('demo', () => {
        it('wraps a run call: a planted violation the scanner must catch', () => {
          ruleTester.run('demo', rule, { valid: [], invalid: [] })
        })
      })
    `
    const violations = findViolations(source, 'control.test.ts')
    expect(violations).toHaveLength(1)
    expect(violations[0]?.testName).toBe(
      'wraps a run call: a planted violation the scanner must catch',
    )
  })

  it('does not flag a run call reached only through a further function, used to assert it throws', () => {
    const source = `
      import { RuleTester } from 'eslint'
      import { describe, expect, it } from 'vitest'
      const ruleTester = new RuleTester()
      describe('demo', () => {
        it.each(['a', 'b'])('entry %s is a configuration error', (entry) => {
          const run = () => {
            ruleTester.run('demo', rule, { valid: [], invalid: [] })
          }
          expect(run).toThrow(entry)
        })
      })
    `
    expect(findViolations(source, 'control.test.ts')).toEqual([])
  })

  it('does not flag a ruleTester.run(...) call made directly inside a describe', () => {
    const source = `
      import { RuleTester } from 'eslint'
      import { describe } from 'vitest'
      const ruleTester = new RuleTester()
      describe('demo', () => {
        ruleTester.run('demo', rule, { valid: [], invalid: [] })
      })
    `
    expect(findViolations(source, 'control.test.ts')).toEqual([])
  })
})
