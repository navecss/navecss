import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

import { HEADER } from './support/registry/cleared.ts'
import {
  headed,
  headerFor,
  headerProblems,
  licenseProblems,
  parseNotice,
} from './support/registry/files-header.ts'
import { problemsAt, problemTexts } from './support/registry/files-problem.ts'
import {
  cloneRegistry,
  type LoadedRegistry,
  loadRegistry,
  type RegistryItem,
} from './support/registry/load.ts'
import { PACKAGE_DIR } from './support/stylesheet.ts'

const REPOSITORY_DIR = path.resolve(PACKAGE_DIR, '../..')
const LICENSE = readFileSync(path.join(PACKAGE_DIR, 'LICENSE'), 'utf8')
const ROOT_LICENSE = readFileSync(path.join(REPOSITORY_DIR, 'LICENSE'), 'utf8')
const NOTICE = parseNotice(LICENSE)

// `scripts/check-license-parity.mjs` reads the source tree only, by design, and this release
// leaves it as it is: its digest at the base ref.
const PARITY_SCRIPT = {
  bytes: 27_348,
  sha256: '389780e53c4705bb1dca606ac73cc78d571bab95810a0ab97dd871ecb0aac8f4',
}

const sha256Of = (text: string | Buffer): string => createHash('sha256').update(text).digest('hex')

const itemNamed = (registry: LoadedRegistry, name: string): RegistryItem => {
  const item = registry.items.get(name)
  if (item === undefined) throw new Error(`the registry has no ${name}`)
  return item
}

describe('AC-base-ui-registry-13: The notice travels with every copy', () => {
  const registry = loadRegistry()

  it('has a first line of the conventions length and sha256', () => {
    expect(Buffer.byteLength(HEADER.line1)).toBe(28)
    expect(sha256Of(HEADER.line1)).toBe(HEADER.line1Sha256)
  })

  it('renders the second line from the cleared template: 148 B at the base ref year and holder', () => {
    const line = HEADER.line2(HEADER.line2At.year, HEADER.line2At.holder)
    expect(Buffer.byteLength(line)).toBe(HEADER.line2At.bytes)
    expect(sha256Of(line)).toBe(HEADER.line2At.sha256)
  })

  it('reads the year and holder from the LICENSE on disk, which is the root LICENSE', () => {
    expect(NOTICE.year).toMatch(/^\d{4}$/)
    expect(NOTICE.holder.length).toBeGreaterThan(0)
    expect(LICENSE).toBe(ROOT_LICENSE)
  })

  it('opens every file but NAVECSS-LICENSE with the header for its type, before the directive', () => {
    expect(registry.items.size).toBeGreaterThan(0)
    expect(problemTexts(headerProblems(registry, NOTICE))).toEqual([])
    const filesWithHeader = registry.items.values().flatMap((item) => headed(item))
    expect(filesWithHeader.toArray().length).toBeGreaterThan(0)
  })

  it('ends every item with NAVECSS-LICENSE, once, equal to packages/base-ui/LICENSE', () => {
    expect(problemTexts(licenseProblems(registry, LICENSE))).toEqual([])
  })

  it('leaves scripts/check-license-parity.mjs as the base ref has it', () => {
    const script = readFileSync(path.join(REPOSITORY_DIR, 'scripts/check-license-parity.mjs'))
    expect({ bytes: script.length, sha256: sha256Of(script) }).toEqual(PARITY_SCRIPT)
  })

  describe('controls: the same checks over a planted clone', () => {
    const target = 'components/nave/nave-dialog.parts.ts'
    const withParts = (change: (content: string) => string): LoadedRegistry => {
      const clone = cloneRegistry(registry)
      const file = itemNamed(clone, 'base-ui-dialog').files.find((entry) => entry.target === target)
      if (file?.content === undefined) throw new Error('base-ui-dialog has no parts file')
      file.content = change(file.content)
      return clone
    }

    it('reds one byte changed in one header line, naming the file', () => {
      const header = headerFor('ts', NOTICE)
      const altered = withParts((content) =>
        content.replace(header, () =>
          header.replace('SPDX-License-Identifier', 'SPDX-License-Identifiex'),
        ),
      )
      expect(problemsAt(headerProblems(altered, NOTICE), 'base-ui-dialog', target)).not.toEqual([])
      expect(problemsAt(headerProblems(registry, NOTICE), 'base-ui-dialog', target)).toEqual([])
    })

    it("reds a header moved after 'use client'", () => {
      const header = headerFor('ts', NOTICE)
      const moved = withParts((content) => {
        const body = content.slice(header.length)
        return body.replace("'use client'\n", () => `'use client'\n${header}`)
      })
      const messages = problemsAt(headerProblems(moved, NOTICE), 'base-ui-dialog', target)
      expect(messages.length).toBeGreaterThan(0)
    })

    it('reds NAVECSS-LICENSE moved before the module', () => {
      const clone = cloneRegistry(registry)
      const item = itemNamed(clone, 'base-ui-dialog')
      const licenseFile = item.files.at(-1)
      if (licenseFile === undefined) throw new Error('base-ui-dialog has no files')
      item.files = [licenseFile, ...item.files.slice(0, -1)]
      expect(
        problemsAt(licenseProblems(clone, LICENSE), 'base-ui-dialog', 'NAVECSS-LICENSE'),
      ).not.toEqual([])
    })

    it('reds a licence file with one byte changed', () => {
      const clone = cloneRegistry(registry)
      const licenseFile = itemNamed(clone, 'base-ui-dialog').files.at(-1)
      if (licenseFile?.content === undefined) throw new Error('base-ui-dialog has no licence file')
      licenseFile.content = licenseFile.content.replace('MIT License', 'MIT Licence')
      expect(
        problemsAt(licenseProblems(clone, LICENSE), 'base-ui-dialog', 'NAVECSS-LICENSE'),
      ).not.toEqual([])
    })
  })
})
