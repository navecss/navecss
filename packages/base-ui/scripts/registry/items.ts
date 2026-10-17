/**
 * The items and the index: every item a universal shadcn item (`registry:item`, every file a
 * `registry:file` with a plain relative `target`), carrying the five files in a fixed order, the
 * bare names of the package's peers as dependencies and the package's version and peer ranges.
 */
import { LICENSE_FILE } from './license.ts'
import { RegistryBuildError } from './errors.ts'
import { stringsFor } from './words.ts'

export const TARGET_DIRECTORY = 'components/nave'

export interface RegistryFile {
  content?: string
  path: string
  target: string
  type: string
}

export interface RegistryItem {
  $schema: string
  dependencies: string[]
  description: string
  docs: string
  files: RegistryFile[]
  meta: { peerDependencies: Record<string, string>; version: string }
  name: string
  title: string
  type: string
}

export interface ItemFiles {
  readonly entry: string
  readonly module: string
  readonly parts: string
  readonly subpath: string
  readonly wrap: string
}

export interface Manifest {
  peerDependencies: Record<string, string>
  repository: { directory?: string; url: string }
  version: string
}

const file = (name: string, content: string): RegistryFile => ({
  content,
  path: `registry/nave/${name}`,
  target: `${TARGET_DIRECTORY}/${name}`,
  type: 'registry:file',
})

export const buildItem = (files: ItemFiles, license: string, manifest: Manifest): RegistryItem => {
  const stem = `nave-${files.subpath}`
  const { description, docs, title } = stringsFor(
    files.subpath,
    manifest.version,
    manifest.peerDependencies,
  )
  return {
    $schema: 'https://ui.shadcn.com/schema/registry-item.json',
    dependencies: Object.keys(manifest.peerDependencies),
    description,
    docs,
    files: [
      file(`${stem}.ts`, files.entry),
      file(`${stem}.parts.ts`, files.parts),
      file(`${stem}.wrap.ts`, files.wrap),
      file(`${stem}.module.css`, files.module),
      file(LICENSE_FILE, license),
    ],
    meta: { peerDependencies: manifest.peerDependencies, version: manifest.version },
    name: `base-ui-${files.subpath}`,
    title,
    type: 'registry:item',
  }
}

/**
 * Where the package's page is, derived from `repository` as npm derives a package page's link.
 */
export const homepageOf = ({ repository }: Manifest): string => {
  const base = repository.url.replace(/^git\+/, '').replace(/\.git$/, '')
  if (repository.directory === undefined) {
    throw new RegistryBuildError('the manifest has a repository without a directory')
  }
  return `${base}/tree/main/${repository.directory}#readme`
}

export const buildIndex = (
  items: readonly RegistryItem[],
  manifest: Manifest,
): Record<string, unknown> => ({
  $schema: 'https://ui.shadcn.com/schema/registry.json',
  homepage: homepageOf(manifest),
  items: items.map((item) => ({
    ...item,
    files: item.files.map(({ content: _content, ...rest }) => rest),
  })),
  name: 'navecss',
})
