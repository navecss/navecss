import assert from 'node:assert/strict'
import { test } from 'node:test'

import { installDifferences, main, servedDifferences, servedUrl } from './check-registry-reach.mjs'

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

const stepsFor = ({ tarball, served, written }) => ({
  fetchText: async (url) => served.get(url.slice(url.lastIndexOf('/') + 1)),
  install: () => written,
  readTarball: () => tarball,
  versionOf: () => '0.3.0',
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

test('main: a release with no registry exits 1, and 0 only for the latest', async () => {
  const empty = stepsFor({ served: new Map(), tarball: new Map(), written: new Map() })
  const strict = await quietly(() => main([], empty))
  const latest = await quietly(() => main(['--latest'], empty))
  assert.equal(strict.code, 1)
  assert.equal(latest.code, 0)
})
