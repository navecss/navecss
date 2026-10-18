/**
 * AC-native-apply-order-19: the CSS property relation table is generated, kept fresh, carries
 * only names and sets, and adds no runtime dependency. `scripts/generate-property-table.ts` seeds
 * it from `mdn-data` and applies the recorded corrections and logical groups; this file checks
 * the committed table against that generator and against the installed `mdn-data` read on its own.
 */
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, describe, expect, it } from 'vitest'

import {
  findDrift,
  generate,
  OUTPUT_PATH,
  readDriftFrom,
} from '../../scripts/generate-property-table.ts'
import {
  CORRECTIONS,
  type PropertyCorrection,
  SPECIFICATION_TITLES,
  SPECIFICATIONS_COMMIT,
} from '../../scripts/property-table-corrections.ts'
import {
  isCssProperty,
  longhandsOf,
  propertiesRelate,
} from '../../src/directive/property-relations.ts'
import { LOGICAL_GROUPS, PROPERTY_LONGHANDS } from '../../src/directive/property-table.generated.ts'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const PACKAGE_ROOT = path.resolve(HERE, '../..')
const require = createRequire(import.meta.url)

interface MdnProperty {
  computed?: string[] | string
}
const mdnProperties = require('mdn-data/css/properties.json') as Record<string, MdnProperty>
const mdnVersion = (require('mdn-data/package.json') as { version: string }).version

const scratchDirectories: string[] = []
afterAll(() => {
  for (const directory of scratchDirectories) {
    rmSync(directory, { force: true, recursive: true })
  }
})

/**
The names mdn-data holds that are neither custom nor vendor-prefixed.
 */
function mdnPlainNames(): string[] {
  return Object.keys(mdnProperties).filter((name) => !name.startsWith('-'))
}

/**
A property's longhands as mdn-data lists them, resolved through nested shorthands.
 */
function mdnLonghands(name: string): string[] {
  const computed = mdnProperties[name]?.computed
  if (!Array.isArray(computed)) return [name]
  return computed.flatMap((member) => mdnLonghands(member))
}

describe('AC-native-apply-order-19: the committed table equals the generator output', () => {
  it('is byte for byte what the generator produces from the installed mdn-data', () => {
    expect(readFileSync(OUTPUT_PATH, 'utf8')).toBe(generate())
  })

  it('names no drifted entry when the committed table is fresh', () => {
    expect(readDriftFrom(OUTPUT_PATH)).toEqual([])
  })

  it('the generator is deterministic', () => {
    expect(generate()).toBe(generate())
  })
})

describe('AC-native-apply-order-19: control, a changed entry makes the freshness check red and names it', () => {
  it('names the outline entry when one longhand of it is changed in a scratch copy', () => {
    const committed = readFileSync(OUTPUT_PATH, 'utf8')
    const outlineLine = /^ {2}'outline': .*$/m.exec(committed)![0]
    const changedLine = outlineLine.replace('outline-color', 'outline-colour')
    const tampered = committed.replace(outlineLine, () => changedLine)
    expect(tampered).not.toBe(committed)

    const directory = mkdtempSync(path.join(tmpdir(), 'property-table-'))
    scratchDirectories.push(directory)
    const scratch = path.join(directory, 'property-table.generated.ts')
    writeFileSync(scratch, tampered)

    expect(readDriftFrom(scratch)).toEqual(['PROPERTY_LONGHANDS.outline'])
  })

  it('names a removed and an added entry', () => {
    const committed = readFileSync(OUTPUT_PATH, 'utf8')
    const generated = generate()
    const withoutDisplay = committed.replace(/^ {2}'display': .*\n/m, '')
    const withExtra = committed.replace(
      /^ {2}'display': .*\n/m,
      (line) => `${line}  'displayy': ['displayy'],\n`,
    )
    expect(findDrift(withoutDisplay, generated)).toEqual(['PROPERTY_LONGHANDS.display'])
    expect(findDrift(withExtra, generated)).toEqual(['PROPERTY_LONGHANDS.displayy'])
  })

  it('names a changed logical group', () => {
    const committed = readFileSync(OUTPUT_PATH, 'utf8')
    const tampered = committed.replace(/^ {2}'margin': \{.*$/m, (line) =>
      line.replace('margin-top', 'margin-topp'),
    )
    expect(findDrift(tampered, generate())).toEqual(['LOGICAL_GROUPS.margin'])
  })
})

describe('AC-native-apply-order-19: the table answers longhands and whether a name is a property', () => {
  it('holds every plain property of the installed mdn-data, and answers each one', () => {
    for (const name of mdnPlainNames()) {
      expect(isCssProperty(name), name).toBe(true)
      expect(PROPERTY_LONGHANDS[name], name).toBeDefined()
    }
  })

  it('answers, for every property it holds, the same set longhandsOf reports', () => {
    for (const [name, longhands] of Object.entries(PROPERTY_LONGHANDS)) {
      expect(isCssProperty(name), name).toBe(true)
      expect(longhandsOf(name), name).toEqual(longhands)
    }
  })

  it('stores each longhand set transitively: every member of a set is itself a longhand', () => {
    for (const [name, longhands] of Object.entries(PROPERTY_LONGHANDS)) {
      for (const member of longhands) {
        expect(PROPERTY_LONGHANDS[member], `${name} -> ${member}`).toEqual([member])
      }
    }
  })

  it('agrees with mdn-data on every shorthand it lists, and only ever adds to it', () => {
    // `all` is the one name mdn-data gives no sub-properties: the corrections define it.
    const listed = mdnPlainNames().filter((plain) => plain !== 'all')
    for (const name of listed) {
      // A name mdn-data calls a longhand may be a shorthand here (`font-variant`): its own
      // longhands are what the table must hold.
      const expected = mdnLonghands(name).flatMap((member) => PROPERTY_LONGHANDS[member]!)
      for (const longhand of expected) {
        expect(PROPERTY_LONGHANDS[name], name).toContain(longhand)
      }
    }
  })

  it('outline sets exactly outline-color, outline-style and outline-width', () => {
    expect(PROPERTY_LONGHANDS.outline).toEqual(['outline-color', 'outline-style', 'outline-width'])
    expect(propertiesRelate('outline', 'outline-offset')).toBe(false)
  })

  it('holds names, longhand sets and logical groups only: every value is a list of names', () => {
    for (const longhands of Object.values(PROPERTY_LONGHANDS)) {
      expect(longhands.every((member) => /^[a-z][a-z0-9-]*$/.test(member))).toBe(true)
    }
    for (const group of Object.values(LOGICAL_GROUPS)) {
      expect(Object.keys(group)).toEqual(['logical', 'physical'])
      expect(group.logical.length).toBeGreaterThan(0)
      expect(group.physical.length).toBeGreaterThan(0)
    }
  })

  it('has every logical group member as a known longhand', () => {
    for (const [group, { logical, physical }] of Object.entries(LOGICAL_GROUPS)) {
      for (const member of [...logical, ...physical]) {
        expect(PROPERTY_LONGHANDS[member], `${group}: ${member}`).toEqual([member])
      }
    }
  })

  it('keeps every longhand in at most one logical group', () => {
    const seen = new Map<string, string>()
    for (const [group, { logical, physical }] of Object.entries(LOGICAL_GROUPS)) {
      for (const member of [...logical, ...physical]) {
        expect(seen.get(member), member).toBeUndefined()
        seen.set(member, group)
      }
    }
  })
})

describe('AC-native-apply-order-19: the committed file opens with the header', () => {
  const firstLine = readFileSync(OUTPUT_PATH, 'utf8').split('\n', 1)[0]

  it('names the script, the mdn-data version, the corrections file and the command', () => {
    expect(firstLine).toBe(
      `// Generated by packages/core/scripts/generate-property-table.ts from mdn-data ${mdnVersion} ` +
        '(css/properties.json, CC0-1.0) and the corrections in ' +
        'packages/core/scripts/property-table-corrections.ts. ' +
        'Do not edit by hand: run pnpm --filter @navecss/core run generate:property-table.',
    )
  })

  it('names files and a command that exist', () => {
    const manifest = JSON.parse(readFileSync(path.join(PACKAGE_ROOT, 'package.json'), 'utf8')) as {
      scripts: Record<string, string>
    }
    expect(manifest.scripts['generate:property-table']).toBe(
      'node scripts/generate-property-table.ts',
    )
    expect(readdirSync(path.join(PACKAGE_ROOT, 'scripts'))).toEqual(
      expect.arrayContaining(['generate-property-table.ts', 'property-table-corrections.ts']),
    )
  })
})

/**
The recorded corrections for one property.
 */
function correctionFor(property: string): PropertyCorrection[] {
  return CORRECTIONS.filter((correction) => correction.property === property)
}

describe('AC-native-apply-order-19: the hand corrections are recorded with their reasons', () => {
  it('every correction has a reason', () => {
    expect(CORRECTIONS.length).toBeGreaterThanOrEqual(3)
    for (const correction of CORRECTIONS) {
      expect(correction.reason.length, correction.property).toBeGreaterThan(40)
    }
  })

  it('names white-space', () => {
    const [correction] = correctionFor('white-space')
    expect(correction).toBeDefined()
    expect('adds' in correction! && correction.adds).toEqual(
      expect.arrayContaining(['white-space-collapse', 'text-wrap-mode']),
    )
  })

  it("names font's reset-only sub-properties", () => {
    const [correction] = correctionFor('font')
    expect(correction).toBeDefined()
    expect('adds' in correction! && correction.adds).toEqual(
      expect.arrayContaining([
        'font-feature-settings',
        'font-kerning',
        'font-language-override',
        'font-optical-sizing',
        'font-size-adjust',
        'font-variation-settings',
      ]),
    )
  })

  it('names all, with its two exceptions', () => {
    const [correction] = correctionFor('all')
    expect(correction).toBeDefined()
    expect('except' in correction! && correction.except).toEqual(['direction', 'unicode-bidi'])
  })
})

describe('AC-native-apply-order-19: mdn-data is a direct exact-pinned devDependency and never ships', () => {
  const manifest = JSON.parse(
    readFileSync(path.join(PACKAGE_ROOT, 'package.json'), 'utf8'),
  ) as Record<string, Record<string, string> | undefined>

  it('is in devDependencies at the installed version, pinned exactly', () => {
    expect(manifest.devDependencies?.['mdn-data']).toBe(mdnVersion)
    expect(manifest.devDependencies?.['mdn-data']).toMatch(/^\d+\.\d+\.\d+$/)
  })

  it.each(['dependencies', 'peerDependencies', 'optionalDependencies'])('is not in %s', (field) => {
    expect(manifest[field]?.['mdn-data']).toBeUndefined()
  })

  it('is imported by neither the module nor the table', () => {
    for (const file of ['property-relations.ts', 'property-table.generated.ts']) {
      const source = readFileSync(path.join(PACKAGE_ROOT, 'src/directive', file), 'utf8')
      expect(source, file).not.toMatch(/(?:from|import|require)\s*\(?\s*['"]mdn-data/)
    }
  })

  it('is named by no file under dist/', () => {
    const dist = path.join(PACKAGE_ROOT, 'dist')
    const files = readdirSync(dist, { recursive: true, withFileTypes: true }).filter((entry) =>
      entry.isFile(),
    )
    expect(files.length).toBeGreaterThan(0)
    for (const entry of files) {
      const file = path.join(entry.parentPath, entry.name)
      expect(readFileSync(file, 'utf8'), file).not.toContain('mdn-data')
    }
  })
})

describe('AC-native-apply-order-19: LICENSE credits mdn-data and the specifications', () => {
  const license = readFileSync(path.join(PACKAGE_ROOT, 'LICENSE'), 'utf8')
  const flat = license.replaceAll(/\s+/g, ' ')
  const thirdParty = flat.slice(flat.indexOf('THIRD-PARTY MATERIAL'))

  it('keeps the existing third-party paragraphs', () => {
    expect(thirdParty).toContain('CSS Syntax Module Level 3')
    expect(thirdParty).toContain('ECMA-426')
  })

  it('holds the credit paragraph with the placeholders filled', () => {
    const specifications = SPECIFICATION_TITLES.join(', ')
    expect(thirdParty).toContain(
      'This package also includes material copied from or derived from mdn-data ' +
        `(css/properties.json in the mdn/data repository, version ${mdnVersion}, ` +
        'https://github.com/mdn/data), which its authors dedicated to the public domain ' +
        'under CC0 1.0 Universal (https://creativecommons.org/publicdomain/zero/1.0/), ' +
        `and from ${specifications.replace(/, ([^,]+)$/, ', and $1')} ` +
        `(in the w3c/csswg-drafts repository, at commit ${SPECIFICATIONS_COMMIT}). ` +
        'Copyright (c) 2026 World Wide Web Consortium. Those specifications, and the repository ' +
        'carrying them, are published under the W3C Software and Document License ' +
        '(https://www.w3.org/copyright/software-license-2023/).',
    )
    expect(thirdParty).toContain(
      'What is copied or derived is implemented in ' +
        'src/directive/property-table.generated.ts, built into the JavaScript under dist/: ' +
        'the names of CSS properties, the properties each shorthand sets, and which logical and ' +
        "physical properties belong to one group. The code using them is this package's own, " +
        'and everything in this package is offered under the MIT licence above.',
    )
  })

  it('records a full commit hash and names every specification by title', () => {
    expect(SPECIFICATIONS_COMMIT).toMatch(/^[0-9a-f]{40}$/)
    expect(SPECIFICATION_TITLES).toContain('CSS Logical Properties and Values Module Level 1')
    expect(SPECIFICATION_TITLES).toContain('CSS Fonts Module Level 4')
    expect(SPECIFICATION_TITLES).toContain('CSS Text Module Level 4')
    expect(SPECIFICATION_TITLES).toContain('CSS Cascading and Inheritance Module Level 5')
  })
})
