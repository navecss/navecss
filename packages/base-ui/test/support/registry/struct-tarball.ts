/**
 * What the tarball holds and whether the package's public surface moved: the packed listing and the
 * `exports` map, read from the head alone.
 */
import { execFileSync } from 'node:child_process'
import { isDeepStrictEqual } from 'node:util'

import { PACKAGE_DIR } from '../stylesheet.ts'
import { SUBPATHS } from '../subpaths.ts'

export const REGISTRY_PREFIX = 'package/dist/registry/'

/**
 * The tarball's entries, each as `package/<path>`, from `npm pack --dry-run --json --ignore-scripts`
 * run offline.
 */
export const packedEntries = (): string[] => {
  const stdout = execFileSync('npm', ['pack', '--dry-run', '--json', '--ignore-scripts'], {
    cwd: PACKAGE_DIR,
    encoding: 'utf8',
    env: { ...process.env, npm_config_offline: 'true', npm_config_update_notifier: 'false' },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  const reply = JSON.parse(stdout) as unknown
  const entry = (Array.isArray(reply) ? reply[0] : Object.values(reply as object)[0]) as {
    files: { path: string }[]
  }
  return entry.files.map((file) => `package/${file.path}`)
}

/**
 * Each registry file name that the tarball does not list under `package/dist/registry/`.
 */
export const missingFromTarball = (
  entries: readonly string[],
  registryFileNames: readonly string[],
): string[] =>
  registryFileNames
    .map((name) => `${REGISTRY_PREFIX}${name}`)
    .filter((entry) => !entries.includes(entry))

export type ExportsMap = Record<string, unknown>

/**
 * Where `exports` differs from the expected map, key for key and value for value.
 */
export const exportsProblems = (actual: ExportsMap, expected: ExportsMap): string[] => [
  ...Object.keys(expected)
    .filter((key) => !Object.hasOwn(actual, key))
    .map((key) => `exports lost ${key}`),
  ...Object.keys(actual)
    .filter((key) => !Object.hasOwn(expected, key))
    .map((key) => `exports gained ${key}`),
  ...Object.keys(expected)
    .filter((key) => Object.hasOwn(actual, key) && !isDeepStrictEqual(actual[key], expected[key]))
    .map((key) => `exports changed ${key}`),
]

const conditions = (directory: string): ExportsMap => ({
  types: `./dist/${directory}index.d.ts`,
  import: `./dist/${directory}index.js`,
  default: `./dist/${directory}index.js`,
})

/**
 * The `exports` map the package has had since its components shipped, rebuilt from the package's
 * own roster of subpaths: the root, one entry per subpath, the stylesheet (with the types file that
 * lets a side-effect import of it type-check) and the manifest.
 */
export const rosterExports = (): ExportsMap => ({
  '.': conditions(''),
  ...Object.fromEntries(SUBPATHS.map((subpath) => [`./${subpath}`, conditions(`${subpath}/`)])),
  './styles.css': { types: './dist/css.d.ts', default: './dist/styles.css' },
  './package.json': './package.json',
})

const stringsOf = (value: unknown): string[] => {
  if (typeof value === 'string') return [value]
  if (value === null || typeof value !== 'object') return []
  return Object.values(value).flatMap((inner) => stringsOf(inner))
}

/**
 * Each key and each string value of `exports`, at any depth, that names `registry`: an item is
 * never importable.
 */
export const registryExportProblems = (exportsMap: ExportsMap): string[] =>
  [...Object.keys(exportsMap), ...stringsOf(exportsMap)]
    .filter((text) => /registry/i.test(text))
    .map((text) => `exports names registry: ${text}`)
