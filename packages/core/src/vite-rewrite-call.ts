/**
 * The edits that turn a call the plugin read into the value it returns: `cx()` into its class
 * string (a literal when every argument is constant, otherwise the arguments in their places,
 * joined as `cx.raw()` joins), `cx.raw()` into the join, and `cx.dynamic()` into a lookup in a
 * map of the atoms the plugin ships for it. The rewrite adds no import and no function.
 */
import type { AstNode } from './vite-ast.ts'
import type { ArgumentFrame } from './vite-rewrite-class.ts'
import type { Edit } from './vite-rewrite-edit.ts'

import { nodeAt, nodesAt } from './vite-ast.ts'
import { constantOf } from './vite-cx-args.ts'
import { classEdits, classOf } from './vite-rewrite-class.ts'

const JOIN = '].filter(Boolean).join(" ")'

/**
 * The offset just past the comment that starts at `at`, or `undefined` when none does.
 */
function afterComment(code: string, at: number): number | undefined {
  if (code.startsWith('/*', at)) {
    const end = code.indexOf('*/', at + 2)
    return end === -1 ? code.length : end + 2
  }
  if (!code.startsWith('//', at)) return undefined
  const end = code.slice(at).search(/[\n\r\u{2028}\u{2029}]/u)
  return end === -1 ? code.length : at + end + 1
}

/**
 * The offset just past the `(` that opens the arguments of `call`: what stands between the end of
 * the callee and that parenthesis is the closing parentheses of a callee written in parentheses,
 * `?.`, white space and comments.
 */
function argumentsStart(code: string, call: AstNode): number | undefined {
  let at = nodeAt(call, 'callee')!.end
  while (at < code.length) {
    const char = code[at]!
    if (char === '(') return at + 1
    const comment = afterComment(code, at)
    if (char === ')' || /\s/.test(char)) at += 1
    else if (code.startsWith('?.', at)) at += 2
    else if (comment === undefined) return undefined
    else at = comment
  }
  return undefined
}

/**
 * Whether the call is the first thing a statement says, where a line before it that was left
 * unfinished would otherwise take what the call becomes (`[`) for an index into it.
 */
function isStatementStart(call: AstNode, frame: ArgumentFrame): boolean {
  let node = call
  let parent = frame.analysis.parentOf.get(node)
  if (parent?.type === 'ChainExpression') {
    node = parent
    parent = frame.analysis.parentOf.get(node)
  }
  return parent?.type === 'ExpressionStatement' && parent.start === node.start
}

/**
 * The text a call becomes, led by the `;` that closes the line before when it needs one.
 */
function lead(call: AstNode, frame: ArgumentFrame): string {
  return isStatementStart(call, frame) ? ';' : ''
}

/**
 * The call whose arguments are joined: its head up to the first argument becomes `[`, its closing
 * parenthesis becomes the join, and `inside` edits the arguments in between.
 */
function joined(call: AstNode, frame: ArgumentFrame, inside: readonly Edit[]): Edit[] | undefined {
  const open = argumentsStart(frame.code, call)
  if (open === undefined) return undefined
  return [
    { start: call.start, end: open, text: `${lead(call, frame)}[` },
    ...inside,
    { start: call.end - 1, end: call.end, text: JOIN },
  ]
}

/**
 * The call replaced whole by the string `text`.
 */
function literal(call: AstNode, frame: ArgumentFrame, text: string): Edit[] {
  return [{ start: call.start, end: call.end, text: `${lead(call, frame)}${JSON.stringify(text)}` }]
}

/**
 * The constants `arguments` are, or `undefined` when any depends on something.
 */
function constantsOf(args: readonly AstNode[], frame: ArgumentFrame): string[] | undefined {
  const constants = args.map((arg) => constantOf(arg, frame.analysis))
  return constants.includes(undefined) ? undefined : (constants as string[])
}

/**
 * The edits for a `cx(...)` call whose arguments the plugin read in full.
 */
export function cxCallEdits(call: AstNode, frame: ArgumentFrame): Edit[] | undefined {
  const args = nodesAt(call, 'arguments')
  const constants = constantsOf(args, frame)
  if (constants) {
    return literal(
      call,
      frame,
      constants
        .filter(Boolean)
        .map((name) => classOf(name))
        .join(' '),
    )
  }
  return joined(
    call,
    frame,
    args.flatMap((arg) => classEdits(arg, frame)),
  )
}

/**
 * The edits for a `cx.raw(...)` call: the join, with nothing mapped.
 */
export function rawCallEdits(call: AstNode, frame: ArgumentFrame): Edit[] | undefined {
  const args = nodesAt(call, 'arguments')
  const constants = constantsOf(args, frame)
  if (constants) return literal(call, frame, constants.filter(Boolean).join(' '))
  return joined(call, frame, [])
}

/**
 * The call a `cx.raw` member read is the callee of, or `undefined` when it is aliased or
 * destructured instead.
 */
export function rawCallOf(member: AstNode, frame: ArgumentFrame): AstNode | undefined {
  const parent = frame.analysis.parentOf.get(member)
  return parent?.type === 'CallExpression' && nodeAt(parent, 'callee') === member
    ? parent
    : undefined
}

/**
 * The offset of the comma that follows the last argument, if the call has one: between the
 * argument and the call's closing parenthesis there are only the closing parentheses of an
 * argument written in parentheses, white space, comments and that comma.
 */
function trailingComma(code: string, argument: AstNode, call: AstNode): number | undefined {
  let at = argument.end
  const end = call.end - 1
  while (at < end) {
    const char = code[at]!
    if (char === ',') return at
    const comment = afterComment(code, at)
    if (char === ')' || /\s/.test(char)) at += 1
    else if (comment === undefined) return undefined
    else at = comment
  }
  return undefined
}

/**
 * The edits for a `cx.dynamic(name)` call: a lookup of the one argument in the map named `map`,
 * which a name outside it, or a falsy one, leaves at `''`. A call with any other number of
 * arguments, or a spread, is left to the run-time function.
 */
export function dynamicCallEdits(
  call: AstNode,
  frame: ArgumentFrame,
  map: string,
): Edit[] | undefined {
  const args = nodesAt(call, 'arguments')
  const open = argumentsStart(frame.code, call)
  const [argument] = args
  if (open === undefined || args.length !== 1 || argument!.type === 'SpreadElement') {
    return undefined
  }
  const comma = trailingComma(frame.code, argument!, call)
  return [
    { start: call.start, end: open, text: `${lead(call, frame)}(${map}[` },
    ...(comma === undefined ? [] : [{ start: comma, end: comma + 1, text: '' }]),
    { start: call.end - 1, end: call.end, text: '] || "")' },
  ]
}
