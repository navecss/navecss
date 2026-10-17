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
 * Run it after each release that serves the registry (`--version`), and on a schedule against the
 * latest release with the CLI a reader gets from the README (`--latest --cli latest`). With
 * `--latest`, a release whose tarball carries no registry yet is reported and skipped, so the
 * schedule is quiet until the first release that serves one. It cannot run in the release job,
 * which only stages the packages: an approved version is not on npm yet when that job ends.
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
  const directory = path.join(scratch, 'package/dist/registry')
  try {
    return new Map(
      readdirSync(directory).map((name) => [
        name,
        readFileSync(path.join(directory, name), 'utf8'),
      ]),
    )
  } catch {
    return new Map()
  }
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

export const main = async (argv = process.argv.slice(2)) => {
  const version = versionOf(argv)
  const cli = optionOf(argv, '--cli') ?? '4'
  const scratch = mkdtempSync(path.join(tmpdir(), 'registry-reach-'))
  try {
    const tarball = readTarballRegistry(version, scratch)
    if (tarball.size === 0) {
      console.log(`${PACKAGE}@${version} carries no registry`)
      return argv.includes('--latest') ? 0 : 1
    }
    const served = await fetchServed(version, [...tarball.keys()], fetchOrUndefined)
    const problems = servedDifferences(tarball, served)
    const item = JSON.parse(tarball.get(`${INSTALLED_ITEM}.json`) ?? '{}')
    if (problems.length === 0) {
      problems.push(...installDifferences(item, installFromServed(version, item, cli, scratch)))
    }
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
