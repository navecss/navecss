/**
 * The atom each local class name of a copy's CSS Module stands for, read from the modules' text and
 * from the package stylesheet's atom classes: an atom's local name is its name minus `baseUi`, first
 * letter lower-cased, and its class is `nave-` and the name in kebab case. Nothing here reads the
 * generator.
 */
import postcss from 'postcss'

const PACKAGE_ATOM_CLASS = /\.(nave-base-ui-[\w-]+)/g
const LOCAL_CLASS = /\.([A-Z_a-z][\w]*)/g

/**
 * The local name of an atom's class: `nave-base-ui-dialog-popup` is `dialogPopup`.
 */
export const localNameOf = (atomClass: string): string => {
  const camel = atomClass
    .replace(/^nave-/, '')
    .replaceAll(/-(\w)/g, (_, letter: string) => letter.toUpperCase())
  const rest = camel.replace(/^baseUi/, '')
  return `${rest.slice(0, 1).toLowerCase()}${rest.slice(1)}`
}

const selectorsOf = (css: string): string[] => {
  const selectors: string[] = []
  postcss.parse(css).walkRules((rule) => {
    selectors.push(rule.selector)
  })
  return selectors
}

const classesIn = (selectors: readonly string[], pattern: RegExp): Set<string> =>
  new Set(
    selectors.flatMap((selector) =>
      selector
        .matchAll(pattern)
        .map((match) => match[1] ?? '')
        .toArray(),
    ),
  )

/**
 * Every atom class the package stylesheet carries a rule for.
 */
export const atomClassesOf = (stylesheet: string): Set<string> =>
  classesIn(selectorsOf(stylesheet), PACKAGE_ATOM_CLASS)

/**
 * The local class names a module has a rule for.
 */
export const localClassesOf = (moduleCss: string): Set<string> =>
  classesIn(selectorsOf(moduleCss), LOCAL_CLASS)

export interface AtomMapping {
  /**
  The atom class (`nave-base-ui-dialog-popup`) each local name stands for.
   */
  readonly atomOf: ReadonlyMap<string, string>
  readonly problems: readonly string[]
}

const atomsByLocalName = (stylesheet: string): Map<string, string[]> => {
  const byLocal = new Map<string, string[]>()
  for (const atomClass of atomClassesOf(stylesheet)) {
    const local = localNameOf(atomClass)
    byLocal.set(local, [...(byLocal.get(local) ?? []), atomClass])
  }
  return byLocal
}

/**
 * The mapping over all the given modules (by file name). A local name that matches no atom, or more
 * than one, or that two modules read as different atoms, is a problem.
 */
export const atomMapping = (
  modules: ReadonlyMap<string, string>,
  stylesheet: string,
): AtomMapping => {
  const byLocal = atomsByLocalName(stylesheet)
  const atomOf = new Map<string, string>()
  const problems: string[] = []
  for (const [name, css] of modules) {
    for (const local of localClassesOf(css)) {
      const candidates = byLocal.get(local) ?? []
      if (candidates.length === 1) {
        atomOf.set(local, candidates[0] ?? '')
      } else {
        problems.push(`${name}: .${local} stands for ${candidates.length} atoms`)
      }
    }
  }
  return { atomOf, problems }
}

/**
 * The atom each class token a module's `styles` object hands out stands for: the object maps a local
 * name to the class the bundler (or the test runner's CSS Modules transform) made of it, and the
 * local name is read as an atom by `mapping`. A key no atom stands for has no entry.
 */
export const tokenAtoms = (
  classMaps: Iterable<Readonly<Record<string, string>>>,
  mapping: AtomMapping,
): Map<string, string> => {
  const atomOfToken = new Map<string, string>()
  for (const classes of classMaps) {
    for (const [local, token] of Object.entries(classes)) {
      const atom = mapping.atomOf.get(local)
      if (atom !== undefined) atomOfToken.set(token, atom)
    }
  }
  return atomOfToken
}
