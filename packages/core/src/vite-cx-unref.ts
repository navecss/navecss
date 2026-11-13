/**
 * Where a Vue template reference stands for a binding: `@vitejs/plugin-vue` compiles a template
 * reference into `unref(cx)`, a call that stands for the binding wherever the binding may stand.
 */
import type { AstNode } from './vite-ast.ts'
import type { Reading } from './vite-cx-refuse.ts'

import { nodeAt, nodesAt } from './vite-ast.ts'

/**
 * Whether the callee of a call is `unref` imported from `vue` under any local name.
 */
function isVueUnref(reading: Reading, callee: AstNode | undefined): boolean {
  if (callee?.type !== 'Identifier') return false
  const binding = reading.analysis.referenceOf(callee)?.binding
  return binding?.kind === 'import' && binding.source === 'vue' && binding.imported === 'unref'
}

/**
 * Looks through `unref(cx)`, which `@vitejs/plugin-vue` compiles a template reference into: the
 * call stands for the binding wherever the binding may stand.
 */
export function throughUnref(reading: Reading, expression: AstNode): AstNode {
  let current = expression
  for (;;) {
    const call = reading.analysis.parentOf.get(current)
    const args = call ? nodesAt(call, 'arguments') : []
    const isUnref =
      call?.type === 'CallExpression' &&
      args.length === 1 &&
      args[0] === current &&
      isVueUnref(reading, nodeAt(call, 'callee'))
    if (!isUnref) return current
    current = call
  }
}
