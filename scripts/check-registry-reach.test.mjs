import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

import {
  installDifferences,
  main,
  peerProblem,
  registryFilesIn,
  servedDifferences,
  servedUrl,
} from './check-registry-reach.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

const TARBALL = new Map([
  ['base-ui-dialog.json', '{"name":"base-ui-dialog"}\n'],
  ['registry.json', '{"name":"navecss"}\n'],
])

test('servedUrl: names the package, the exact version and the registry directory', () => {
  assert.equal(
    servedUrl('0.3.0', 'registry.json'),
    'https://cdn.jsdelivr.net/npm/@navecss/base-ui@0.3.0/dist/registry/registry.json',
  )
})

test('servedDifferences: a registry served as published has no difference', () => {
  assert.deepEqual(servedDifferences(TARBALL, new Map(TARBALL)), [])
})

test('servedDifferences: a file that is not served is named', () => {
  const served = new Map([...TARBALL, ['registry.json', undefined]])
  assert.deepEqual(servedDifferences(TARBALL, served), ['registry.json: not served'])
})

test('servedDifferences: a file served with other bytes is named', () => {
  const served = new Map([...TARBALL, ['base-ui-dialog.json', '{"name":"base-ui-dialog"} \n']])
  assert.deepEqual(servedDifferences(TARBALL, served), [
    "base-ui-dialog.json: served bytes differ from the tarball's",
  ])
})

const ITEM = {
  files: [
    { content: 'a\n', target: 'components/nave/nave-dialog.ts' },
    { content: 'b\n', target: 'components/nave/NAVECSS-LICENSE' },
  ],
}
const WRITTEN = new Map([
  ['src/components/nave/nave-dialog.ts', 'a\n'],
  ['src/components/nave/NAVECSS-LICENSE', 'b\n'],
])

test('installDifferences: files written as the item has them have no difference', () => {
  assert.deepEqual(installDifferences(ITEM, WRITTEN), [])
})

test('installDifferences: a missing, a changed and an extra file are each named', () => {
  assert.deepEqual(installDifferences(ITEM, new Map([...WRITTEN].slice(0, 1))), [
    'components/nave/NAVECSS-LICENSE: not written',
    'wrote 1 files, the item has 2',
  ])
  assert.deepEqual(
    installDifferences(ITEM, new Map([...WRITTEN, ['src/components/nave/nave-dialog.ts', 'x\n']])),
    ['components/nave/nave-dialog.ts: written bytes differ from the item'],
  )
  assert.deepEqual(installDifferences(ITEM, new Map([...WRITTEN, ['extra.ts', 'c\n']])), [
    'wrote 3 files, the item has 2',
  ])
})

const DIALOG_ITEM = JSON.stringify({
  files: [{ content: 'a\n', target: 'components/nave/nave-dialog.ts' }],
  meta: { peerDependencies: { react: '^18 || ^19' } },
  name: 'base-ui-dialog',
})

const stepsFor = ({ tarball, served, written, version = '0.3.0', latest = {} }) => ({
  fetchText: async (url) => served.get(url.slice(url.lastIndexOf('/') + 1)),
  install: () => written,
  latestOf: (name) => latest[name],
  readTarball: () => tarball,
  versionOf: () => version,
})

const quietly = async (run) => {
  const logged = []
  const { error, log } = console
  console.log = (line) => logged.push(line)
  console.error = (line) => logged.push(line)
  try {
    return { code: await run(), logged }
  } finally {
    console.log = log
    console.error = error
  }
}

const registry = new Map([['base-ui-dialog.json', DIALOG_ITEM]])
const installed = new Map([['src/components/nave/nave-dialog.ts', 'a\n']])

test('main: a registry served as published that installs as the item has it exits 0', async () => {
  const { code, logged } = await quietly(() =>
    main([], stepsFor({ served: new Map(registry), tarball: registry, written: installed })),
  )
  assert.equal(code, 0)
  assert.match(logged.join('\n'), /1 files served as published, and base-ui-dialog installs/)
})

test('main: a file served with other bytes exits 1 and names it', async () => {
  const served = new Map([['base-ui-dialog.json', `${DIALOG_ITEM} `]])
  const { code, logged } = await quietly(() =>
    main([], stepsFor({ served, tarball: registry, written: installed })),
  )
  assert.equal(code, 1)
  assert.match(logged.join('\n'), /base-ui-dialog\.json: served bytes differ/)
})

test('main: files that install differently from the item exit 1', async () => {
  const { code, logged } = await quietly(() =>
    main(
      [],
      stepsFor({
        served: new Map(registry),
        tarball: registry,
        written: new Map([['x.ts', 'a\n']]),
      }),
    ),
  )
  assert.equal(code, 1)
  assert.match(logged.join('\n'), /not written/)
})

test('main: a release with no registry exits 1 when it is not the latest', async () => {
  const empty = stepsFor({ served: new Map(), tarball: new Map(), written: new Map() })
  const { code } = await quietly(() => main([], empty))
  assert.equal(code, 1)
})

test('main: --latest with no registry exits 0 below 0.3.0, the first version that writes one', async () => {
  const before = stepsFor({
    served: new Map(),
    tarball: new Map(),
    version: '0.2.0',
    written: new Map(),
  })
  const { code, logged } = await quietly(() => main(['--latest'], before))
  assert.equal(code, 0)
  assert.match(logged.join('\n'), /@navecss\/base-ui@0\.2\.0 carries no registry/)
})

test('main: --latest with no registry exits 1 from 0.3.0 on, comparing numbers and not text', async () => {
  for (const version of ['0.3.0', '0.10.0', '1.0.0']) {
    const after = stepsFor({ served: new Map(), tarball: new Map(), version, written: new Map() })
    const { code } = await quietly(() => main(['--latest'], after))
    assert.equal(code, 1, version)
  }
})

test('main: a registry that has files but no base-ui-dialog.json exits 1 and names it', async () => {
  const noDialog = new Map([['registry.json', '{"name":"navecss"}\n']])
  const { code, logged } = await quietly(() =>
    main([], stepsFor({ served: new Map(noDialog), tarball: noDialog, written: new Map() })),
  )
  assert.equal(code, 1)
  assert.match(logged.join('\n'), /base-ui-dialog\.json: not in the registry/)
})

test('main: fetches every file at the exact version it was given', async () => {
  const urls = []
  const steps = {
    ...stepsFor({ served: new Map(registry), tarball: registry, written: installed }),
    fetchText: async (url) => {
      urls.push(url)
      return registry.get(url.slice(url.lastIndexOf('/') + 1))
    },
  }
  await quietly(() => main([], steps))
  assert.deepEqual(
    urls.toSorted(),
    [...registry.keys()].map((name) => servedUrl('0.3.0', name)).toSorted(),
  )
})

test('main: hands the --cli value to the install step', async () => {
  let given
  const steps = {
    ...stepsFor({ served: new Map(registry), tarball: registry, written: installed }),
    install: (_version, _item, cli) => {
      given = cli
      return installed
    },
  }
  await quietly(() => main(['--cli', 'latest'], steps))
  assert.equal(given, 'latest')
})

test('registryFilesIn: reads each file of a directory by name', () => {
  const scratch = mkdtempSync(path.join(tmpdir(), 'reach-'))
  try {
    writeFileSync(path.join(scratch, 'registry.json'), '{}\n')
    assert.deepEqual([...registryFilesIn(scratch)], [['registry.json', '{}\n']])
  } finally {
    rmSync(scratch, { force: true, recursive: true })
  }
})

test('registryFilesIn: a directory that cannot be read is an error, not an empty registry', () => {
  const scratch = mkdtempSync(path.join(tmpdir(), 'reach-'))
  try {
    mkdirSync(path.join(scratch, 'sub'))
    assert.throws(() => registryFilesIn(scratch))
    assert.equal(registryFilesIn(path.join(scratch, 'absent')).size, 0)
  } finally {
    rmSync(scratch, { force: true, recursive: true })
  }
})

test('peerProblem: a version inside each of the three range shapes has no problem', () => {
  assert.equal(peerProblem('@base-ui/react', '1.3.0', '^1.3.0'), undefined)
  assert.equal(peerProblem('@base-ui/react', '1.9.4', '^1.3.0'), undefined)
  assert.equal(peerProblem('@navecss/tokens', '0.4.0', '>=0.4.0 <1.0.0'), undefined)
  assert.equal(peerProblem('@navecss/tokens', '0.99.3', '>=0.4.0 <1.0.0'), undefined)
  assert.equal(peerProblem('react', '18.3.1', '^18 || ^19'), undefined)
  assert.equal(peerProblem('react', '19.2.0', '^18 || ^19'), undefined)
})

test('peerProblem: a version above the ceiling is named with its range', () => {
  assert.match(
    peerProblem('@base-ui/react', '2.0.0', '^1.3.0'),
    /@base-ui\/react@2\.0\.0.*\^1\.3\.0/,
  )
  assert.match(
    peerProblem('@navecss/tokens', '1.0.0', '>=0.4.0 <1.0.0'),
    /@navecss\/tokens@1\.0\.0/,
  )
  assert.match(peerProblem('react', '20.0.0', '^18 || ^19'), /react@20\.0\.0.*\^18 \|\| \^19/)
})

test('peerProblem: a version below the floor is named with its range', () => {
  assert.match(peerProblem('@base-ui/react', '1.2.9', '^1.3.0'), /@base-ui\/react@1\.2\.9/)
  assert.match(
    peerProblem('@navecss/tokens', '0.3.9', '>=0.4.0 <1.0.0'),
    /@navecss\/tokens@0\.3\.9/,
  )
  assert.match(peerProblem('react', '17.9.9', '^18 || ^19'), /react@17\.9\.9/)
})

test('peerProblem: compares numbers and not text', () => {
  assert.equal(peerProblem('@navecss/tokens', '0.10.0', '>=0.4.0 <1.0.0'), undefined)
  assert.match(peerProblem('react', '100.0.0', '^18 || ^19'), /react@100\.0\.0/)
})

test('peerProblem: a range of any other shape is a problem, never a pass', () => {
  for (const range of ['~1.3.0', '^1.3', '>=1.3.0', '>=18 <20', '^1.3.0 || ^2', '*', '']) {
    assert.match(peerProblem('react', '18.3.1', range), /cannot be read/, range)
  }
})

test('peerProblem: a caret range with a patch above zero is a problem, as the generator does not word it', () => {
  assert.match(peerProblem('@base-ui/react', '1.3.5', '^1.3.1'), /cannot be read/)
})

test('peerProblem: a caret range on a 0.x version is a problem, as the generator does not word it', () => {
  assert.match(peerProblem('@navecss/tokens', '0.4.1', '^0.4.0'), /cannot be read/)
})

test('peerProblem: a version that is not three numbers is a problem', () => {
  assert.match(peerProblem('react', 'latest', '^18 || ^19'), /react@latest/)
  assert.match(peerProblem('react', '19.0.0-rc.1', '^18 || ^19'), /react@19\.0\.0-rc\.1/)
})

const peerItem = (peerDependencies) =>
  JSON.stringify({
    files: [{ content: 'a\n', target: 'components/nave/nave-dialog.ts' }],
    meta: { peerDependencies },
    name: 'base-ui-dialog',
  })

const withPeers = (peerDependencies, latest) => {
  const tarball = new Map([['base-ui-dialog.json', peerItem(peerDependencies)]])
  return stepsFor({ latest, served: new Map(tarball), tarball, written: installed })
}

test('main: --latest exits 0 when the latest version of every peer is inside its range', async () => {
  const steps = withPeers(
    { '@base-ui/react': '^1.3.0', react: '^18 || ^19' },
    { '@base-ui/react': '1.8.0', react: '19.2.0' },
  )
  const { code } = await quietly(() => main(['--latest'], steps))
  assert.equal(code, 0)
})

test('main: --latest exits 1 and names a peer whose latest version is outside its range', async () => {
  const steps = withPeers(
    { '@base-ui/react': '^1.3.0', react: '^18 || ^19' },
    { '@base-ui/react': '2.0.0', react: '19.2.0' },
  )
  const { code, logged } = await quietly(() => main(['--latest'], steps))
  assert.equal(code, 1)
  assert.match(logged.join('\n'), /@base-ui\/react@2\.0\.0/)
  assert.doesNotMatch(logged.join('\n'), /react@19/)
})

test('main: --latest names a peer outside its range wherever it sits in the item', async () => {
  const steps = withPeers(
    { react: '^18 || ^19', '@base-ui/react': '^1.3.0' },
    { react: '19.2.0', '@base-ui/react': '2.0.0' },
  )
  const { code, logged } = await quietly(() => main(['--latest'], steps))
  assert.equal(code, 1)
  assert.match(logged.join('\n'), /@base-ui\/react@2\.0\.0/)
})

test('main: --latest exits 1 when a peer has a range of a shape it cannot read', async () => {
  const steps = withPeers({ react: '~18.0.0' }, { react: '18.0.1' })
  const { code, logged } = await quietly(() => main(['--latest'], steps))
  assert.equal(code, 1)
  assert.match(logged.join('\n'), /cannot be read/)
})

test('AC-base-ui-registry-33: the release guide names the check a release of the package is told to run', () => {
  const guide = readFileSync(path.join(ROOT, 'docs/02-contribute/releasing.md'), 'utf8')
  const start = guide.indexOf('\n## 4. Check it is live\n')
  assert.notEqual(start, -1, 'the guide has no "## 4. Check it is live" section')
  const end = guide.indexOf('\n## ', start + 1)
  const section = guide.slice(start, end === -1 ? undefined : end)
  assert.ok(
    section.includes('```sh\nnode scripts/check-registry-reach.mjs --version <version>\n```'),
    'the section has no fenced `node scripts/check-registry-reach.mjs --version <version>`',
  )
})

test('AC-base-ui-registry-33: the weekly workflow runs the check against the latest release', () => {
  const workflow = readFileSync(path.join(ROOT, '.github/workflows/registry-reach.yml'), 'utf8')
  assert.match(workflow, /^ {2}schedule:$/m)
  assert.ok(workflow.includes('node scripts/check-registry-reach.mjs --latest --cli latest'))
})
