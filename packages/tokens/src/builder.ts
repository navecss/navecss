/**
 * The build runner the first-party reader plugs into. Replaces
 * Style Dictionary's `StyleDictionary` instance, `registerFormat` and
 * `registerTransformGroup`: `transformGroup` disappears entirely because one of its two
 * members (`attribute/cti`) was dead (nothing read `.attributes`) and the other
 * (`name/kebab`) is folded into the reader's own name computation.
 */

import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'

import type { FlatToken } from './reader.ts'

import { detectDuplicateEmittedNames, refuseOnDuplicateNames } from './collision.ts'
import { readTokens } from './reader.ts'

interface BuildFile {
  destination: string
  format: (tokens: FlatToken[]) => string
  filter?: (token: FlatToken) => boolean
}

interface BuildPlatform {
  buildPath: string
  files: BuildFile[]
}

export interface BuildConfig {
  source: string[]
  platforms: Record<string, BuildPlatform>
}

export interface OutputFile {
  /**
  The final path, build path included.
   */
  destination: string
  content: string
}

/**
 * Reads every source file, flattens and resolves its tokens, then COMPOSES every configured
 * platform's file in memory. A per-file `filter` narrows the token list handed to that
 * file's `format`; a format with no platform-level filter still applies its own
 * public/private distinction internally, same as before.
 *
 * Composition is split from writing (`writeOutputs`) for `AC-theming-05`: the build must
 * fail "before any artifact is written", with "no partially regenerated `tokens.css` left
 * on disk", and a runner that writes as it goes cannot offer that whatever its callers do.
 */
export async function composeBuild(config: BuildConfig): Promise<OutputFile[]> {
  const tokens: FlatToken[] = []
  for (const source of config.source) {
    const raw: unknown = JSON.parse(await readFile(source, 'utf8'))
    tokens.push(...readTokens(raw, source))
  }
  // Two paths resolving to one emitted name is a check on readTokens's RESULT
  // (kebabName/nameFromPath are many-to-one by design), run before any format function sees
  // the list, so a collision refuses before `tokens.css`/`tokens.d.ts` are ever composed.
  refuseOnDuplicateNames(detectDuplicateEmittedNames(tokens))

  const outputs: OutputFile[] = []
  for (const platform of Object.values(config.platforms)) {
    for (const file of platform.files) {
      const filter = file.filter
      const scoped = filter ? tokens.filter((token) => filter(token)) : tokens
      outputs.push({
        destination: path.join(platform.buildPath, file.destination),
        content: file.format(scoped),
      })
    }
  }
  return outputs
}

/**
 * The build's ONE write phase (`AC-theming-05`). Every file goes to a temporary sibling
 * first and is renamed into place only once every temporary write has succeeded, so a run
 * that fails leaves each artifact either absent or at its previous complete content, never
 * half-regenerated. Rename is atomic within a directory on every platform Nave builds on.
 */
export async function writeOutputs(files: readonly OutputFile[]): Promise<void> {
  const staged: { destination: string; temporary: string }[] = []
  try {
    for (const file of files) {
      await mkdir(path.dirname(file.destination), { recursive: true })
      const temporary = `${file.destination}.${process.pid}.tmp`
      await writeFile(temporary, file.content)
      staged.push({ destination: file.destination, temporary })
    }
    for (const { destination, temporary } of staged) await rename(temporary, destination)
  } finally {
    for (const { temporary } of staged) await rm(temporary, { force: true })
  }
}
