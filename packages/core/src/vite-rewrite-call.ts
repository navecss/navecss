/**
 * The edits that turn a call the plugin read into the value it returns: `cx()` into its class
 * string (a literal when every argument is constant, otherwise the arguments in their places,
 * joined as `cx.raw()` joins), `cx.raw()` into the join, and `cx.dynamic()` into a lookup in a
 * map of the atoms the plugin ships for it, written out at the call. The rewrite adds no import
 * and no function.
 */
import type { AstNode } from './vite-ast.ts'
import type { ArgumentFrame } from './vite-rewrite-class.ts'
import type { Edit } from './vite-rewrite-edit.ts'

import { nodeAt, nodesAt } from './vite-ast.ts'
import { constantOf } from './vite-cx-args.ts'
import { classEdits, classOf } from './vite-rewrite-class.ts'
import { afterComment } from './vite-rewrite-edit.ts'

const JOIN = '].filter(Boolean).join(" ")'

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
 * The nodes that hold a list of statements, in which a statement follows another.
 */
const STATEMENT_LISTS: ReadonlySet<string> = new Set([
  'BlockStatement',
  'Program',
  'StaticBlock',
  'SwitchCase',
])

/**
 * Whether the call is the first thing a statement of a statement list says, where a line before
 * it that was left unfinished would otherwise take what the call becomes (`[` or `(`) for an
 * index or a call on it. The statement may start with more than the call (`cx(...).length`,
 * `cx(...) + x`, `cx(...), x`), so the walk up goes through every node that starts where the call
 * does. A statement that is the body of an `if`, a loop or a label is no list: nothing before it
 * can continue into it, and a `;` there would be its body, leaving the rest to run every time.
 */
function isStatementStart(call: AstNode, frame: ArgumentFrame): boolean {
  const { parentOf } = frame.analysis
  let node = call
  for (let parent = parentOf.get(node); parent?.start === call.start; parent = parentOf.get(node)) {
    node = parent
  }
  const holder = parentOf.get(node)
  return (
    node.type === 'ExpressionStatement' && holder !== undefined && STATEMENT_LISTS.has(holder.type)
  )
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
 * The edits for a `cx.dynamic(...)` call: a lookup of its first argument in `map`, the text of a
 * map of the atoms the plugin ships, which a name outside it, or a falsy one, leaves at `''`. The
 * one plain argument is looked up where it stands. Any other arguments (none, several, a spread)
 * are gathered in a list first, which evaluates each once, in order, and the first of the list is
 * looked up: what the run-time function does with them.
 */
export function dynamicCallEdits(
  call: AstNode,
  frame: ArgumentFrame,
  map: string,
): Edit[] | undefined {
  const args = nodesAt(call, 'arguments')
  const open = argumentsStart(frame.code, call)
  if (open === undefined) return undefined
  const [argument] = args
  const head = `${lead(call, frame)}(${map}[`
  const end = { start: call.end - 1, end: call.end }
  if (args.length !== 1 || argument!.type === 'SpreadElement') {
    return [
      { start: call.start, end: open, text: `${head}[` },
      { ...end, text: '][0]] || "")' },
    ]
  }
  const comma = trailingComma(frame.code, argument!, call)
  return [
    { start: call.start, end: open, text: head },
    ...(comma === undefined ? [] : [{ start: comma, end: comma + 1, text: '' }]),
    { ...end, text: '] || "")' },
  ]
}
