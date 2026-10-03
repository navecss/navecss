/**
 * Finding what a compiled Vue template's component exposes to it. A component's template is
 * compiled into a render function that reads `$setup.<name>`, and the bindings `<script setup>`
 * exposes are returned by a different module, so the template has to ask for that module. The main
 * module of the component imports its script (and, for `<template src>`, its template), which is
 * the link; loading the script runs it through this plugin first, which records what it exposes.
 */
import type { AstNode } from './vite-ast.ts'
import type { SetupExposures } from './vite-setup-member.ts'
import type { TransformContext } from './vite-types.ts'
import type { UsedContext } from './vite-used.ts'

import { nodeAt, nodesAt, staticStringOf } from './vite-ast.ts'
import { moduleKey } from './vite-state.ts'

export interface ModuleInput {
  readonly program: AstNode
  readonly code: string
  readonly id: string
}

/**
 * The import specifiers in `program` that contain `marker`.
 */
function importsContaining(program: AstNode, marker: string): string[] {
  const sources = nodesAt(program, 'body').map((node) =>
    node.type === 'ImportDeclaration' ? staticStringOf(nodeAt(node, 'source')) : undefined,
  )
  return sources.filter((source) => source?.includes(marker) === true) as string[]
}

/**
 * The id `source` resolves to from `importer`.
 */
async function resolveId(
  ctx: TransformContext,
  source: string,
  importer: string,
): Promise<string | undefined> {
  const resolved = await ctx.resolve?.(source, importer)
  return resolved?.id
}

/**
 * Notes which `<script setup>` module each template module this one imports belongs to.
 */
async function linkTemplates(
  context: UsedContext,
  ctx: TransformContext,
  input: ModuleInput,
  scriptId: string,
): Promise<void> {
  const environment = ctx.environment?.name ?? 'client'
  for (const template of importsContaining(input.program, 'type=template')) {
    const templateId = await resolveId(ctx, template, input.id)
    if (templateId !== undefined) {
      context.state.templateLinks.set(moduleKey(environment, templateId), scriptId)
    }
  }
}

/**
 * What the `<script setup>` of the component this module belongs to exposes to its template,
 * when this module is (or imports) a compiled template that reads `$setup`.
 */
export async function setupExposuresFor(
  context: UsedContext,
  ctx: TransformContext,
  input: ModuleInput,
): Promise<SetupExposures | undefined> {
  const environment = ctx.environment?.name ?? 'client'
  const [script] = importsContaining(input.program, 'type=script')
  const scriptId = script === undefined ? undefined : await resolveId(ctx, script, input.id)
  if (scriptId !== undefined) await linkTemplates(context, ctx, input, scriptId)
  if (!input.code.includes('$setup')) return undefined
  const owner = scriptId ?? context.state.templateLinks.get(moduleKey(environment, input.id))
  if (owner === undefined) return undefined
  await ctx.load?.({ id: owner })
  return context.state.exposures.get(moduleKey(environment, owner))
}
