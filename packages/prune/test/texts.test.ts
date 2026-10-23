/**
 * The sentences the package prints on its own, byte for byte: each is a claim a reader acts on,
 * so a change to one is a change to this file.
 */
import { describe, expect, it } from 'vitest'

import {
  BOTH_PLUGINS,
  incomplete,
  markdownWarning,
  outputMismatch,
  pagesNotBundled,
  READS_NO_USE,
  staleFile,
  staleOptions,
} from '../src/texts.ts'

const README = 'https://github.com/navecss/navecss/tree/main/packages/prune#what-it-cannot-see'

describe('AC-nextjs-used-atoms-26: both plugins listed', () => {
  it('names the plugin to remove and says what the other one does, in every configuration', () => {
    expect(BOTH_PLUGINS).toBe(
      "withNave(): both @navecss/prune/postcss and @navecss/core/postcss are in your PostCSS config. Remove '@navecss/core/postcss': @navecss/prune/postcss expands @nave as well.",
    )
  })
})

describe('AC-nextjs-used-atoms-31: a record older than what it read', () => {
  it('says the build cannot tell whether the atoms match, for a changed file', () => {
    expect(staleFile('app/page.tsx', '.next/cache')).toBe(
      'withNave(): app/page.tsx changed after @navecss/prune/postcss read it, so this build cannot tell whether the atoms it ships match your code. Delete .next/cache and run next build again.',
    )
  })

  it('says the same for changed options, without claiming the code changed', () => {
    expect(staleOptions('.next/cache')).toBe(
      'withNave(): the options given to withNave() changed after @navecss/prune/postcss read them, so this build cannot tell whether the atoms it ships match them. Delete .next/cache and run next build again.',
    )
  })
})

describe('AC-nextjs-used-atoms-06: a plugin that stopped before it finished', () => {
  it('lists each failure once on its own line and branches the remedy on the extend option', () => {
    expect(incomplete(['first failure.', 'first failure.', 'second failure.'], '.next/cache')).toBe(
      [
        "withNave(): @navecss/prune/postcss stopped before it finished, so this build's atoms were not checked:",
        'first failure.',
        'second failure.',
        'If a line above says the extend option could not be used, fix extend in withNave(). Otherwise delete .next/cache and run next build again, and if it stops again, report it to @navecss/prune with this output.',
      ].join('\n'),
    )
  })
})

describe('AC-nextjs-used-atoms-36: the CSS does not hold the atoms the build keeps', () => {
  it('names the directory it read, the file of the first stray rule and both kinds of difference', () => {
    expect(
      outputMismatch({
        cache: '.next/cache',
        file: '.next/static/css/app.css',
        missing: ['flex'],
        output: '.next/static',
        stray: ['block', 'hidden'],
      }),
    ).toBe(
      'withNave(): the CSS in .next/static does not match the atoms this build keeps: it has a rule for block, hidden (first seen in .next/static/css/app.css), which this build does not keep; it has no rule for flex, which this build keeps. Delete .next/cache and run next build again. If it fails again, look for a PostCSS plugin or other CSS step that edits @layer atomic, and if there is none, report it to @navecss/prune with this output.',
    )
  })

  it('names no file when only a rule is missing', () => {
    expect(
      outputMismatch({
        cache: '.next/cache',
        file: '',
        missing: ['flex'],
        output: '.next/static',
        stray: [],
      }),
    ).toBe(
      'withNave(): the CSS in .next/static does not match the atoms this build keeps: it has no rule for flex, which this build keeps. Delete .next/cache and run next build again. If it fails again, look for a PostCSS plugin or other CSS step that edits @layer atomic, and if there is none, report it to @navecss/prune with this output.',
    )
  })
})

describe('AC-nextjs-used-atoms-16: Markdown and MDX files the build did not read', () => {
  it('says only an atom used there alone has no rule', () => {
    expect(markdownWarning(['components/a.md', 'components/b.mdx'])).toBe(
      `Nave: @navecss/prune does not read Markdown or MDX, so it did not read these files or the modules only they import: components/a.md, components/b.mdx. An atom used only there has no rule unless keep or keepFor lists it. See "What it cannot see": ${README}.`,
    )
  })
})

describe('AC-nextjs-used-atoms-30: a build that read no use of an atom', () => {
  it('names both edits that ship every atom, under the case that calls for it', () => {
    expect(READS_NO_USE).toBe(
      `Nave: this build read no use of an atom, so its atom layer holds only what keep and keepFor name. A Nave class written where the build cannot read it, such as in text from a CMS, has no rule unless keep or keepFor lists its atom. See "What it cannot see": ${README}. If most of your Nave classes are written in such places, ship every atom instead: put '@navecss/core/postcss' in place of '@navecss/prune/postcss' in your PostCSS config, and remove withNave() from next.config.`,
    )
  })
})

describe('AC-nextjs-used-atoms-39: a package the Pages Router does not bundle', () => {
  it('states the condition on the config withNave() received and names a wrapper it does not see', () => {
    expect(pagesNotBundled('dyn-pages')).toBe(
      "withNave(): dyn-pages calls cx.dynamic() in code a pages/ entry reaches, and the config withNave() received neither lists it in transpilePackages nor sets bundlePagesRouterDependencies: true. With that config the Pages Router does not bundle it, so cx.dynamic() there would not know which atoms this build kept. Add 'dyn-pages' to transpilePackages in next.config, or set bundlePagesRouterDependencies: true. withNave() does not see a wrapper applied after it, so if another wrapper sets either option, make withNave() the outermost: export default withNave(withOther(nextConfig)).",
    )
  })
})
