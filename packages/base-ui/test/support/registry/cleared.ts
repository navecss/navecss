/**
 * The registry's cleared bytes: every block a person cleared as written, stored under
 * `test/fixtures/registry/cleared/<name>.txt` exactly as cleared (UTF-8, LF, no trailing newline).
 * Each row pins the block's length and full sha256, and `cleared()` checks both when it reads, so a
 * one-word edit to a fixture fails here before any criterion that uses the block reads it.
 *
 * Names follow the spec: `S-a` and `S-b` are the root README's item 9 and the layer sentence,
 * `W-outline` is the stylelint disable comment, `W-list` the tripwire list, `ladder-L1` and
 * `ladder-L2` the README's `## Overriding` count line and its new steps (the spec's `L1` and `L2`
 * of the README, not the licence header lines, which `HEADER` below names).
 */
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import path from 'node:path'

import { PACKAGE_DIR } from '../stylesheet.ts'

interface ClearedRow {
  readonly bytes: number
  readonly sha256: string
}

const CLEARED: Readonly<Record<string, ClearedRow>> = {
  'C-add-help': {
    bytes: 67,
    sha256: '99138abbbbfb3fc9d0cef2f1d885c838491cf171a51c4d75b01f6b6021fdef60',
  },
  'C-doc': {
    bytes: 250,
    sha256: 'c013f7a8097558992d011ba39e110f24aa59b230d6b6123bb1fff4d5f4cba5d7',
  },
  'C-notyet': {
    bytes: 142,
    sha256: 'bbeedfa522b2765eafc14ce3ada93d931a7ab88ddf3316d37916b7d75a4dd3ae',
  },
  'D-claude42': {
    bytes: 197,
    sha256: '526da558c179e3d4047e000d16996452326a67037741425d806acd9ad4d76379',
  },
  'D-index23': {
    bytes: 189,
    sha256: '2c1c120ce840941c2aee0c3bf3deb33a5efee7c611b48bf672b64d3ce809666a',
  },
  'D-index47': {
    bytes: 229,
    sha256: 'a3d3d924bab64a2350544fb74d640bb8dd54384880ad7cd329ae8e7b54ce0d39',
  },
  'D-tech12': {
    bytes: 299,
    sha256: '63014108365035192c2337623a7b40616a81f32b3feab6c05287f721e3782906',
  },
  'ladder-L1': {
    bytes: 40,
    sha256: 'a930062a2cc23d898937b1001dd71f732dd27aa95e521e5dc9ca83c76a610e14',
  },
  'ladder-L2': {
    bytes: 390,
    sha256: 'ea2856084a281be0fc3541e3b3e5caa0d2178f62dc683e19a29c989aedfcae17',
  },
  N: { bytes: 356, sha256: 'd039b6e2f95ce8d8a750d00b8a3b71db2b1f90998b7e9b0addec1e80dce8576b' },
  P: { bytes: 181, sha256: '72aaedfad0263190f0c668f6ae923f966b4bc7ee8c19a7cf6af34039fb0e7b4b' },
  'S-a': { bytes: 369, sha256: '94c7009a8c2e4c2fc7f539771cf15e5cf6830115bbdfe8429cb7b5589fd8411b' },
  'S-b': { bytes: 388, sha256: '1020e8d4abbf70c02841c0284cf59983f309e88b5b56b602a5f1ea02d4086d27' },
  'S-noform': {
    bytes: 4817,
    sha256: '7f9e8d1ffa3da1c8969169fc9dddc0ef2115872b732fd4794acda6743a54c323',
  },
  'T-desc': {
    bytes: 218,
    sha256: '57fe974108cdfc88098e68094df05d0577597f99f1c7651488bcb1b4b9828876',
  },
  'T-docs': {
    bytes: 517,
    sha256: '36e8a97056ee2394f8d770fd951f3c9907c172363c9bbb1b658688764f6dea18',
  },
  'T-title': {
    bytes: 38,
    sha256: '7bb6337fc250dacb2403a6d89d074162aab303aea645454507ca228557c9f9df',
  },
  'W-list': {
    bytes: 411,
    sha256: '53982f5679849399bf6c789755a08a22ee77d0fb22e5d74082d57ddf206832bc',
  },
  'W-outline': {
    bytes: 230,
    sha256: '753659ea65dacfdf35d668f6f6f4d009992029c059e4b565932afcd1edc5d4b8',
  },
}

export type ClearedName = keyof typeof CLEARED

export const CLEARED_NAMES = Object.keys(CLEARED)

const sha256Of = (text: string): string => createHash('sha256').update(text, 'utf8').digest('hex')

/**
 * A cleared block's text, after checking its length and sha256 against the row. Throws, naming the
 * block, when the fixture differs from what was cleared.
 */
export const cleared = (name: string): string => {
  const row = CLEARED[name]
  if (row === undefined) throw new Error(`no cleared block named ${name}`)
  const text = readFileSync(
    path.join(PACKAGE_DIR, 'test/fixtures/registry/cleared', `${name}.txt`),
    'utf8',
  )
  const bytes = Buffer.byteLength(text, 'utf8')
  if (bytes !== row.bytes || sha256Of(text) !== row.sha256) {
    throw new Error(`cleared block ${name} is not the cleared bytes (${bytes} B)`)
  }
  return text
}

/**
 * The row of a cleared block: its length and sha256.
 */
export const clearedRow = (name: string): ClearedRow => {
  const row = CLEARED[name]
  if (row === undefined) throw new Error(`no cleared block named ${name}`)
  return row
}

/**
 * The two header lines every copied file but `NAVECSS-LICENSE` opens with, as the spec's
 * conventions give them. The second is a template: the year and holder come from `LICENSE`.
 */
export const HEADER = {
  line1: 'SPDX-License-Identifier: MIT',
  line1Sha256: 'adcef9d88762da9951c56d4d7b61235fb458f9d2bbc4516538e5a1b4d214aed4',
  line2: (year: string, holder: string): string =>
    `Copyright (c) ${year} ${holder}. From NaveCSS (https://github.com/navecss/navecss), under the MIT License; the full text is in NAVECSS-LICENSE.`,
  /**
   * The year and holder at the base ref, and the digest of the line they give.
   */
  line2At: {
    bytes: 148,
    holder: 'Nave Contributors',
    sha256: '71e31948b05eff3c1f83e5ff31a44965bba4196da365ee3c257ce8c9ae218b60',
    year: '2026',
  },
} as const
