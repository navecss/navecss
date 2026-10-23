/**
 * The built registry as the install criteria use it: the item files a CLI is pointed at, the tree an
 * install of those items must leave behind, and the packed tarball's copy of the registry.
 */
import { execFile } from 'node:child_process'
import { mkdirSync } from 'node:fs'
import path from 'node:path'
import { promisify } from 'node:util'

import { PACKAGE_DIR } from '../stylesheet.ts'
import { hermeticEnv, inheritedPath } from './cli-run.ts'
import { type LoadedRegistry, loadRegistry, type RegistryItem } from './load.ts'

const run = promisify(execFile)

/**
 * The registry the build wrote. Throws when it is absent.
 */
export const builtRegistry = (): LoadedRegistry => loadRegistry()

/**
 * The item files of a registry, by item name, as paths on disk.
 */
export const itemFilePaths = (registry: LoadedRegistry): Map<string, string> =>
  new Map(
    registry.items
      .keys()
      .map((name) => [name, path.join(registry.directory, `${name}.json`)] as const),
  )

export interface ServedTree {
  /**
  Targets that two items serve with different content, which no single install could satisfy.
   */
  readonly conflicts: string[]
  /**
  Project-relative path to served content.
   */
  readonly files: Map<string, string>
}

/**
 * What an install of the items must leave behind: each file at `<prefix><target>` with its served
 * content, a target that several items serve (`NAVECSS-LICENSE`) once.
 */
export const servedTree = (items: Iterable<RegistryItem>, prefix: string): ServedTree => {
  const files = new Map<string, string>()
  const conflicts: string[] = []
  for (const item of items) {
    for (const file of item.files) {
      const target = `${prefix}${file.target}`
      const seen = files.get(target)
      if (seen !== undefined && seen !== file.content) conflicts.push(`${item.name}: ${target}`)
      files.set(target, file.content ?? '')
    }
  }
  return { conflicts, files }
}

/**
 * Packs the package as `npm pack` does (no scripts, so the build's output is what is packed) into
 * `directory` and unpacks it there. Returns the unpacked package directory, `<directory>/package`.
 */
export const packAndUnpack = async (directory: string, home: string): Promise<string> => {
  const env = { ...hermeticEnv(home), ...inheritedPath(), npm_config_update_notifier: 'false' }
  mkdirSync(directory, { recursive: true })
  const packed = await run(
    'npm',
    ['pack', '--ignore-scripts', '--json', '--pack-destination', directory],
    {
      cwd: PACKAGE_DIR,
      env,
      maxBuffer: 64 * 1024 * 1024,
      timeout: 180_000,
    },
  )
  const reply = JSON.parse(packed.stdout) as { filename: string }[]
  const filename = reply[0]?.filename
  if (filename === undefined) throw new Error('npm pack named no tarball')
  await run('tar', ['-xzf', path.join(directory, filename), '-C', directory])
  return path.join(directory, 'package')
}
