import assert from 'node:assert/strict'
import { test } from 'node:test'

import { installDifferences, servedDifferences, servedUrl } from './check-registry-reach.mjs'

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
