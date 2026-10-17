/**
 * The universal-item predicate: every item validates against the pinned CLI's `registryItemSchema`,
 * is a `registry:item`, and has only `registry:file` files whose target is a plain relative path
 * under `components/nave/`.
 */
import path from 'node:path'
import { registryItemSchema } from 'shadcn/schema'

import type { LoadedRegistry, RegistryFile, RegistryItem } from './load.ts'

import { itemsOf } from './struct-mutate.ts'

const TARGET_ROOT = 'components/nave/'

const PLAIN_SEGMENT = /^[\w.-]+$/

/**
 * Whether a target is a plain relative path beginning `components/nave/`: no `@`, `~`, `..`,
 * placeholder, drive, backslash or leading slash.
 */
export const isPlainNaveTarget = (target: string): boolean => {
  if (!target.startsWith(TARGET_ROOT)) return false
  const segments = target.split('/')
  return segments.every((segment) => PLAIN_SEGMENT.test(segment) && !/^\.+$/.test(segment))
}

const fileProblems = (item: RegistryItem, file: RegistryFile): string[] => {
  const name = path.posix.basename(file.path)
  return [
    ...(file.type === 'registry:file'
      ? []
      : [`${item.name}: ${name} has type ${file.type}, not registry:file`]),
    ...(typeof file.target === 'string' && isPlainNaveTarget(file.target)
      ? []
      : [`${item.name}: ${name} has target ${file.target}, not a plain components/nave/ path`]),
  ]
}

const itemProblems = (item: RegistryItem): string[] => {
  const parsed = registryItemSchema.safeParse(item)
  return [
    ...(parsed.success
      ? []
      : parsed.error.issues.map(
          (issue) => `${item.name}: schema: ${issue.path.join('.')}: ${issue.message}`,
        )),
    ...(item.type === 'registry:item' ? [] : [`${item.name}: has type ${item.type}`]),
    ...item.files.flatMap((file) => fileProblems(item, file)),
  ]
}

/**
 * Every item validates, is `registry:item`, and has only universal files.
 */
export const universalProblems = (registry: LoadedRegistry): string[] =>
  itemsOf(registry).flatMap((item) => itemProblems(item))
