/**
 * Running the registry build's own entry point as a process on a temporary copy of the package
 * whose manifest is edited, and reading what it printed and wrote.
 */
import { spawnSync } from 'node:child_process'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { PACKAGE_DIR } from '../stylesheet.ts'

export interface BuildRun {
  /**
  The registry items the run wrote to its output directory.
   */
  readonly items: string[]
  /**
  Standard output and standard error, joined.
   */
  readonly output: string
  readonly status: number | undefined
}

const GENERATOR = path.join(PACKAGE_DIR, 'scripts/generate-registry.ts')

const linkEverythingBut = (root: string, kept: ReadonlySet<string>): void => {
  for (const entry of readdirSync(PACKAGE_DIR)) {
    if (kept.has(entry)) continue
    symlinkSync(path.join(PACKAGE_DIR, entry), path.join(root, entry))
  }
}

/**
 * Builds the registry from a copy of the package whose `peerDependencies` are the manifest's with
 * `peerOverrides` laid over them. Everything else in the copy is the package's own.
 */
export const buildWithPeers = (peerOverrides: Readonly<Record<string, string>>): BuildRun => {
  const work = mkdtempSync(path.join(tmpdir(), 'registry-strings-'))
  try {
    const root = path.join(work, 'package')
    const out = path.join(work, 'out')
    const manifest = JSON.parse(readFileSync(path.join(PACKAGE_DIR, 'package.json'), 'utf8')) as {
      peerDependencies: Record<string, string>
    }
    manifest.peerDependencies = { ...manifest.peerDependencies, ...peerOverrides }
    mkdirSync(root)
    linkEverythingBut(root, new Set(['package.json']))
    writeFileSync(path.join(root, 'package.json'), `${JSON.stringify(manifest, undefined, 2)}\n`)
    const result = spawnSync(process.execPath, [GENERATOR, '--root', root, '--out', out], {
      cwd: root,
      encoding: 'utf8',
      timeout: 150_000,
    })
    const items = existsSync(out)
      ? readdirSync(out).filter((name) => name.endsWith('.json') && name !== 'registry.json')
      : []
    return { items, output: `${result.stdout}${result.stderr}`, status: result.status ?? undefined }
  } finally {
    rmSync(work, { force: true, recursive: true })
  }
}
