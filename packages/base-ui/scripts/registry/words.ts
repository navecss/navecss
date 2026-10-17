/**
 * The registry-facing strings of an item: its title, description and docs message are fixed texts
 * with named slots, and the three version floors in the docs are worded from the package's
 * `peerDependencies`. A range that cannot be put into words fails the build rather than printing a
 * raw range.
 */
import { topName } from '../wrappers/subpaths.ts'
import { RegistryBuildError } from './errors.ts'

const TITLE = 'NaveCSS styling of Base UI <Component>'

const DESCRIPTION =
  "NaveCSS's styling of the Base UI <Component>, as files copied into your project: Base UI's parts from @base-ui/react, which Base UI's maintainers publish, with Nave's classes from a CSS Module that reads Nave's tokens."

const DOCS = [
  'Import { <Export> } from the nave-<subpath> file just written, not from @navecss/base-ui/<subpath>.',
  "Keep @navecss/tokens/css imported: the copied rules read Nave's tokens. They sit in a CSS Module, so your build needs CSS Modules.",
  'The copy needs @base-ui/react <base-ui floor>, @navecss/tokens <tokens floor>, and React <react floor>. A version already in your package.json is kept; a missing package is installed at its latest version.',
  'Generated from @navecss/base-ui <version>. No later release changes these files.',
].join('\n')

const unwordable = (name: string, range: string): RegistryBuildError =>
  new RegistryBuildError(
    `the range "${range}" of the peer ${name} cannot be put into words: teach scripts/registry/words.ts its shape`,
  )

const withoutPatch = (version: string): string => version.replace(/\.0$/, '')

const caretFloor = (range: string): string | undefined => {
  const caret = /^\^(\d+)\.(\d+)\.0$/.exec(range)
  return caret?.[1] === undefined || caret[2] === undefined || caret[1] === '0'
    ? undefined
    : `${caret[1]}.${caret[2]} or later in the ${caret[1]}.x line`
}

const boundedFloor = (range: string): string | undefined => {
  const bounded = /^>=(\d+\.\d+\.\d+) <(\d+\.\d+\.\d+)$/.exec(range)
  return bounded?.[1] === undefined || bounded[2] === undefined
    ? undefined
    : `${bounded[1]} or later before ${withoutPatch(bounded[2])}`
}

const majorsFloor = (range: string): string | undefined => {
  const majors = /^\^(\d+) \|\| \^(\d+)$/.exec(range)
  return majors?.[1] === undefined || majors[2] === undefined
    ? undefined
    : `${majors[1]} or ${majors[2]}`
}

/**
 * `^1.3.0` is "1.3 or later in the 1.x line", `>=0.4.0 <1.0.0` is "0.4.0 or later before 1.0", and
 * `^18 || ^19` is "18 or 19".
 */
export const floorInWords = (name: string, range: string): string => {
  const words = caretFloor(range) ?? boundedFloor(range) ?? majorsFloor(range)
  if (words === undefined) throw unwordable(name, range)
  return words
}

export interface Strings {
  readonly description: string
  readonly docs: string
  readonly title: string
}

const componentName = (subpath: string): string =>
  subpath
    .split('-')
    .map((word) => `${word.slice(0, 1).toUpperCase()}${word.slice(1)}`)
    .join(' ')

const peer = (peers: Readonly<Record<string, string>>, name: string): string => {
  const range = peers[name]
  if (range === undefined) throw new RegistryBuildError(`the manifest has no peer ${name}`)
  return range
}

export const stringsFor = (
  subpath: string,
  version: string,
  peers: Readonly<Record<string, string>>,
): Strings => {
  const slots: Record<string, string> = {
    '<Component>': componentName(subpath),
    '<Export>': topName(subpath),
    '<base-ui floor>': floorInWords('@base-ui/react', peer(peers, '@base-ui/react')),
    '<react floor>': floorInWords('react', peer(peers, 'react')),
    '<subpath>': subpath,
    '<tokens floor>': floorInWords('@navecss/tokens', peer(peers, '@navecss/tokens')),
    '<version>': version,
  }
  const fill = (template: string): string =>
    Object.entries(slots).reduce(
      (text, [slot, value]) => text.replaceAll(slot, () => value),
      template,
    )
  return { description: fill(DESCRIPTION), docs: fill(DOCS), title: fill(TITLE) }
}
