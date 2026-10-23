#!/usr/bin/env node
/**
 * Checks that the registry a release ships is the registry readers receive: every file under
 * `dist/registry/` of the published `@navecss/base-ui` tarball is fetched from jsDelivr at that
 * exact version and compared byte for byte, and one component is then installed from that address
 * with shadcn's CLI into a directory that has no Tailwind, no `components.json` and no alias, and
 * the files it writes are compared with the item.
 *
 *   node scripts/check-registry-reach.mjs [--version <x.y.z> | --latest] [--cli <version | latest>]
 *
 * Run it by hand after each release that serves the registry (`--version`): the release guide
 * names it in "Check it is live". The weekly registry-reach workflow runs it against the latest
 * release with the CLI a reader gets from the README (`--latest --cli latest`). With `--latest`
 * it also reads the latest published version of every package the components depend on, and fails
 * when one is outside the range the item states.
 *
 * A tarball with no registry is an error, except for the latest release below 0.3.0, the first
 * version whose build writes the registry: the weekly run stays quiet until that release. A
 * directory that cannot be read is an error and never counts as "no registry". The script cannot
 * run in the release job, which only stages the packages: an approved version is not on npm yet
 * when that job ends.
 */
import { execFileSync } from 'node:child_process'
import {
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const PACKAGE = '@navecss/base-ui'
const INSTALLED_ITEM = 'base-ui-dialog'

// The first version of the package whose build writes dist/registry/.
const FIRST_VERSION_WITH_REGISTRY = '0.3.0'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

export const servedUrl = (version, name) =>
  `https://cdn.jsdelivr.net/npm/${PACKAGE}@${version}/dist/registry/${name}`

/**
 * The names whose served text is missing or differs from the tarball's, given the tarball's text
 * by file name and what jsDelivr answered for each (`undefined` when it answered nothing).
 */
export const servedDifferences = (tarball, served) => {
  const problems = []
  for (const [name, text] of tarball) {
    const answered = served.get(name)
    if (answered === undefined) problems.push(`${name}: not served`)
    else if (answered !== text) problems.push(`${name}: served bytes differ from the tarball's`)
  }
  return problems
}

/**
 * The files `add` wrote against the item's own, given the item and the text written by path: a
 * missing, changed or extra file is a problem.
 */
export const installDifferences = (item, written) => {
  const expected = new Map(item.files.map((file) => [file.target, file.content]))
  const problems = []
  for (const [target, content] of expected) {
    const found = [...written].find(([file]) => file.endsWith(target))?.[1]
    if (found === undefined) problems.push(`${target}: not written`)
    else if (found !== content) problems.push(`${target}: written bytes differ from the item`)
  }
  if (written.size !== expected.size) {
    problems.push(`wrote ${written.size} files, the item has ${expected.size}`)
  }
  return problems
}

const run = (command, args, options = {}) =>
  execFileSync(command, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], ...options })

const walk = (directory) =>
  readdirSync(directory, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => path.join(entry.parentPath, entry.name))

/**
 * The files of a registry directory by name. A directory that does not exist is an empty registry;
 * any other failure to read it is thrown, so an unreadable registry is never taken for none.
 */
export const registryFilesIn = (directory) => {
  try {
    return new Map(
      readdirSync(directory).map((name) => [
        name,
        readFileSync(path.join(directory, name), 'utf8'),
      ]),
    )
  } catch (error) {
    if (error?.code === 'ENOENT') return new Map()
    throw error
  }
}

/**
 * `dist/registry/` of the published tarball, by file name; empty when it carries none.
 */
export const readTarballRegistry = (version, scratch) => {
  const packed = run('npm', [
    'pack',
    `${PACKAGE}@${version}`,
    '--pack-destination',
    scratch,
    '--json',
  ])
  const [{ filename }] = JSON.parse(packed)
  run('tar', ['-xzf', path.join(scratch, filename), '-C', scratch])
  return registryFilesIn(path.join(scratch, 'package/dist/registry'))
}

const fetchServed = async (version, names, fetchText) =>
  new Map(
    await Promise.all(names.map(async (name) => [name, await fetchText(servedUrl(version, name))])),
  )

const fetchOrUndefined = async (url) => {
  const response = await fetch(url)
  return response.ok ? response.text() : undefined
}

const installFromServed = (version, item, cli, scratch) => {
  const project = path.join(scratch, 'project')
  mkdirSync(project, { recursive: true })
  const dependencies = Object.fromEntries(
    Object.entries(item.meta.peerDependencies).map(([name, range]) => [
      name,
      /\d[\w.-]*/.exec(range)?.[0] ?? '0.0.0',
    ]),
  )
  writeFileSync(path.join(project, 'package.json'), JSON.stringify({ dependencies, name: 'reach' }))
  run('npx', ['--yes', `shadcn@${cli}`, 'add', servedUrl(version, `${item.name}.json`), '--yes'], {
    cwd: project,
    env: { ...process.env, HOME: scratch },
  })
  return new Map(
    walk(project)
      .filter((file) => !file.endsWith('package.json') && !file.includes('node_modules'))
      .map((file) => [path.relative(project, file), readFileSync(file, 'utf8')]),
  )
}

const VERSION = /^(\d+)\.(\d+)\.(\d+)$/

const parts = (version) => VERSION.exec(version)?.slice(1).map(Number)

const compare = (left, right) => {
  const at = left.findIndex((number, index) => number !== right[index])
  return at === -1 ? 0 : left[at] - right[at]
}

/**
 * Whether `version` is below the first version whose build writes the registry. A version that is
 * not three numbers is not below it.
 */
const writesNoRegistryYet = (version) => {
  const found = parts(version)
  return found !== undefined && compare(found, parts(FIRST_VERSION_WITH_REGISTRY)) < 0
}

/**
 * The versions a range admits, as `[lowest, below]` pairs, for exactly the three shapes the
 * registry generator puts into words: `^X.Y.0` with X above 0, `>=A.B.C <D.E.F` and `^A || ^B`. Any
 * other shape is `undefined`.
 */
const bounds = (range) => {
  const caret = /^\^(\d+)\.(\d+)\.0$/.exec(range)
  if (caret !== null && caret[1] !== '0') {
    const [major, minor] = caret.slice(1).map(Number)
    return [
      [
        [major, minor, 0],
        [major + 1, 0, 0],
      ],
    ]
  }
  const between = /^>=(\d+\.\d+\.\d+) <(\d+\.\d+\.\d+)$/.exec(range)
  if (between !== null) return [[parts(between[1]), parts(between[2])]]
  const majors = /^\^(\d+) \|\| \^(\d+)$/.exec(range)
  if (majors !== null) {
    return majors
      .slice(1)
      .map(Number)
      .map((major) => [
        [major, 0, 0],
        [major + 1, 0, 0],
      ])
  }
  return undefined
}

/**
 * What is wrong with `version` as the latest of a package whose items state `range`, or
 * `undefined` when it is inside the range. A range of any other shape is a problem, never a pass.
 */
export const peerProblem = (name, version, range) => {
  const admitted = bounds(range)
  if (admitted === undefined) return `${name}: the range "${range}" cannot be read by this check`
  const found = parts(version)
  if (found === undefined) return `${name}@${version} is not a version this check can compare`
  const inside = admitted.some(
    ([lowest, below]) => compare(found, lowest) >= 0 && compare(found, below) < 0,
  )
  return inside ? undefined : `${name}@${version} is outside the range "${range}" the items state`
}

const optionOf = (argv, name) => {
  const index = argv.indexOf(name)
  return index === -1 ? undefined : argv[index + 1]
}

const versionOf = (argv) => {
  if (argv.includes('--latest')) return run('npm', ['view', PACKAGE, 'version']).trim()
  return (
    optionOf(argv, '--version') ??
    JSON.parse(readFileSync(path.join(ROOT, 'packages/base-ui/package.json'), 'utf8')).version
  )
}

const latestOf = (name) => run('npm', ['view', name, 'version']).trim()

const REAL_STEPS = {
  fetchText: fetchOrUndefined,
  install: installFromServed,
  latestOf,
  readTarball: readTarballRegistry,
  versionOf,
}

/**
 * The peers of the item whose latest published version is outside the range the item states.
 */
const peerProblems = (item, latestOf) =>
  Object.entries(item.meta?.peerDependencies ?? {})
    .map(([name, range]) => peerProblem(name, latestOf(name), range))
    .filter((problem) => problem !== undefined)

/**
 * Runs the check and returns the exit code. The steps that reach the network or spawn a process are
 * a parameter so a test can answer for them.
 */
export const main = async (argv = process.argv.slice(2), steps = REAL_STEPS) => {
  const version = steps.versionOf(argv)
  const cli = optionOf(argv, '--cli') ?? '4'
  const scratch = mkdtempSync(path.join(tmpdir(), 'registry-reach-'))
  try {
    const tarball = steps.readTarball(version, scratch)
    if (tarball.size === 0) {
      console.log(`${PACKAGE}@${version} carries no registry`)
      return argv.includes('--latest') && writesNoRegistryYet(version) ? 0 : 1
    }
    const served = await fetchServed(version, [...tarball.keys()], steps.fetchText)
    const problems = servedDifferences(tarball, served)
    const itemText = tarball.get(`${INSTALLED_ITEM}.json`)
    if (itemText === undefined) problems.push(`${INSTALLED_ITEM}.json: not in the registry`)
    const item = JSON.parse(itemText ?? '{}')
    if (problems.length === 0) {
      problems.push(...installDifferences(item, steps.install(version, item, cli, scratch)))
    }
    if (argv.includes('--latest')) problems.push(...peerProblems(item, steps.latestOf))
    for (const problem of problems) console.error(`${PACKAGE}@${version}: ${problem}`)
    if (problems.length === 0) {
      console.log(
        `${PACKAGE}@${version}: ${tarball.size} files served as published, and ${INSTALLED_ITEM} installs`,
      )
    }
    return problems.length === 0 ? 0 : 1
  } finally {
    rmSync(scratch, { force: true, recursive: true })
  }
}

if (
  process.argv[1] !== undefined &&
  realpathSync(fileURLToPath(import.meta.url)) === realpathSync(process.argv[1])
) {
  process.exitCode = await main()
}
