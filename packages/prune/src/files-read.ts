/**
 * The files a run of the plugin read, with the digest of each: what the record keeps and what the
 * bundler is told.
 */
import { readFileSync } from 'node:fs'

import type { Graph } from './graph-types.ts'
import type { Handoff } from './handoff.ts'

import { configFilesIn } from './config-files.ts'
import { digestOf } from './digest.ts'
import { extendFileIn } from './extend.ts'

/**
 * The digest of a file's text, or of nothing when it cannot be read.
 */
function digestFileSafely(file: string): string {
  try {
    return digestOf(readFileSync(file))
  } catch {
    return digestOf('')
  }
}

/**
 * The files the plugin read: the graph's, the files that steered its resolution (the resolver's
 * config files, the `package.json` files), the config files and a path-valued `extend` module.
 */
export function filesRead(handoff: Handoff, graph: Graph): Map<string, string> {
  const files = new Map(graph.files)
  const extendFile = extendFileIn(handoff.options, handoff.dir)
  const read = [
    ...graph.inputs.files,
    ...configFilesIn(handoff.dir),
    ...(extendFile === undefined ? [] : [extendFile]),
  ]
  for (const file of read) files.set(file, digestFileSafely(file))
  return files
}
