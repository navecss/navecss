import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

import { cleared } from './support/registry/cleared.ts'
import { itemFormProblems, targetsFor } from './support/registry/files-entry-checks.ts'
import { headerFor, parseNotice } from './support/registry/files-header.ts'
import { type Problem, problemsAt, problemTexts } from './support/registry/files-problem.ts'
import { packageSources } from './support/registry/files-sources.ts'
import {
  cloneRegistry,
  type LoadedRegistry,
  loadRegistry,
  type RegistryItem,
} from './support/registry/load.ts'
import { styledSubpaths } from './support/registry/styled-subpaths.ts'
import { PACKAGE_DIR } from './support/stylesheet.ts'

const NOTICE = parseNotice(readFileSync(path.join(PACKAGE_DIR, 'LICENSE'), 'utf8'))

const itemOf = (registry: LoadedRegistry, subpath: string): RegistryItem => {
  const item = registry.items.get(`base-ui-${subpath}`)
  if (item === undefined) throw new Error(`the registry has no item for ${subpath}`)
  return item
}

const formProblems = (registry: LoadedRegistry): Problem[] =>
  styledSubpaths().flatMap((subpath) => {
    const item = registry.items.get(`base-ui-${subpath}`)
    return item === undefined
      ? [{ file: '(item)', item: `base-ui-${subpath}`, message: 'the registry has no such item' }]
      : itemFormProblems(item, subpath, NOTICE, packageSources(subpath))
  })

const fileOf = (item: RegistryItem, name: string): RegistryItem['files'][number] => {
  const file = item.files.find((candidate) => candidate.target.endsWith(`/${name}`))
  if (file === undefined) throw new Error(`${item.name} has no ${name}`)
  return file
}

const withContent = (
  registry: LoadedRegistry,
  subpath: string,
  name: string,
  change: (content: string) => string,
): LoadedRegistry => {
  const clone = cloneRegistry(registry)
  const file = fileOf(itemOf(clone, subpath), name)
  file.content = change(file.content ?? '')
  return clone
}

describe('AC-base-ui-registry-10: each item has the five files, in order, each in its form', () => {
  const registry = loadRegistry()

  it('derives its subpaths from a non-empty styled set and the item order from the spec', () => {
    expect(styledSubpaths().length).toBeGreaterThan(0)
    expect(targetsFor('dialog')).toEqual([
      'components/nave/nave-dialog.ts',
      'components/nave/nave-dialog.parts.ts',
      'components/nave/nave-dialog.wrap.ts',
      'components/nave/nave-dialog.module.css',
      'components/nave/NAVECSS-LICENSE',
    ])
  })

  it('reports nothing over the registry: targets, entry, parts file, wrap file, imports, suppressions', () => {
    expect(problemTexts(formProblems(registry))).toEqual([])
  })

  it('reds a button entry that is the package index.ts unchanged, naming the directive and the lint comment', () => {
    const sources = packageSources('button')
    const mutated = withContent(
      registry,
      'button',
      'nave-button.ts',
      () => `${headerFor('ts', NOTICE)}${sources.index}`,
    )
    const messages = problemsAt(
      formProblems(mutated),
      'base-ui-button',
      'components/nave/nave-button.ts',
    )
    expect(messages.join('\n')).toContain("'use client' directive")
    expect(messages.join('\n')).toContain('eslint-disable')
  })

  it("reds the parts file when two of a part's atoms swap places", () => {
    const mutated = withContent(registry, 'dialog', 'nave-dialog.parts.ts', (content) =>
      content.replace(/(styles\.dialogPopup)(\}?)( \$\{)?(styles\.popupFade)/, '$4$2$3$1'),
    )
    const target = 'components/nave/nave-dialog.parts.ts'
    expect(fileOf(itemOf(mutated, 'dialog'), 'nave-dialog.parts.ts').content).not.toEqual(
      fileOf(itemOf(registry, 'dialog'), 'nave-dialog.parts.ts').content,
    )
    expect(problemsAt(formProblems(mutated), 'base-ui-dialog', target)).not.toEqual([])
  })

  it('reds a class spelt as a string, a missing directive, and an import the package does not make', () => {
    const target = 'components/nave/nave-dialog.parts.ts'
    const spelt = withContent(registry, 'dialog', 'nave-dialog.parts.ts', (content) =>
      content.replace(/`\$\{styles\.title\}`|styles\.title/, "'nave-base-ui-title'"),
    )
    expect(problemsAt(formProblems(spelt), 'base-ui-dialog', target).join('\n')).toContain(
      'nave-base-ui- string',
    )
    const undirected = withContent(registry, 'dialog', 'nave-dialog.parts.ts', (content) =>
      content.replace("'use client'", "'use strict'"),
    )
    expect(problemsAt(formProblems(undirected), 'base-ui-dialog', target).join('\n')).toContain(
      "'use client' is not the first statement",
    )
    const imported = withContent(registry, 'dialog', 'nave-dialog.parts.ts', (content) =>
      content.replace("from 'react'", "from 'react'\nimport '@navecss/core/atoms'"),
    )
    expect(problemsAt(formProblems(imported), 'base-ui-dialog', target).join('\n')).toContain(
      '@navecss/core/atoms',
    )
  })

  it('reds a wrap file with one byte changed, and targets out of order', () => {
    const wrapped = withContent(
      registry,
      'dialog',
      'nave-dialog.wrap.ts',
      (content) => `${content}\n`,
    )
    expect(
      problemsAt(formProblems(wrapped), 'base-ui-dialog', 'components/nave/nave-dialog.wrap.ts'),
    ).not.toEqual([])
    const reordered = cloneRegistry(registry)
    const files = itemOf(reordered, 'dialog').files
    itemOf(reordered, 'dialog').files = [files[1], files[0], ...files.slice(2)].filter(
      (file): file is RegistryItem['files'][number] => file !== undefined,
    )
    expect(problemsAt(formProblems(reordered), 'base-ui-dialog', '(targets)')).not.toEqual([])
  })

  it('reds a suppression comment, and lets the cleared outline comment through', () => {
    const planted = withContent(
      registry,
      'dialog',
      'nave-dialog.module.css',
      (content) => `${content}\n/* stylelint-disable */\n`,
    )
    expect(
      problemsAt(
        formProblems(planted),
        'base-ui-dialog',
        'components/nave/nave-dialog.module.css',
      ).join('\n'),
    ).toContain('stylelint-disable')
    const cleared_ = withContent(
      registry,
      'dialog',
      'nave-dialog.module.css',
      (content) => `${content}\n${cleared('W-outline')}\n`,
    )
    expect(
      problemsAt(
        formProblems(cleared_),
        'base-ui-dialog',
        'components/nave/nave-dialog.module.css',
      ),
    ).toEqual([])
  })
})
