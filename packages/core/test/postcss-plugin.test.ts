/**
 * Regression tests for the @nave PostCSS plugin.
 *
 * Traceability: these tests reference the correctness-finding IDs from an
 * architecture review. G0 is a correctness batch,
 * not a spec, so the C- finding ID plays the role the AC- ID plays in a spec.
 */
import postcss from 'postcss'
import { describe, expect, it } from 'vitest'

import { navePlugin } from '../src/postcss.ts'

import type { AtomDefinition } from '../src/atoms.ts'

const run = async (css: string, options?: Parameters<typeof navePlugin>[0]): Promise<string> => {
  const result = await postcss([navePlugin(options)]).process(css, { from: undefined })
  return result.css
}

describe('C3 — selector lists must not break pseudo rules', () => {
  it('nests the pseudo inside the rule so every selector in the list gets it', async () => {
    const css = await run('.a, .b { @nave focusRing; }')

    // Native nesting: & resolves to the whole selector list, so .a keeps its
    // focus indicator. The old hoisting emitted `.a, .b:focus-visible`, which
    // silently dropped the ring from .a while leaving `outline: none` on it.
    expect(css).toContain('&:focus-visible')
    expect(css).not.toContain('.b:focus-visible')
    expect(css).toContain('outline: none')
  })

  it('nests media blocks inside the rule, wrapping declarations in &', async () => {
    const css = await run('.a, .b { @nave hidePhoneOnly; }')

    expect(css).toMatch(/@media \(width < [\d.]+em\)/)
    // `& { ... }` rather than bare declarations: bare declarations inside a
    // nested at-rule need CSSNestedDeclarations, which is past the Baseline
    // 2024 floor recorded in docs/04-adr/0001-native-css-nesting.md.
    expect(css).toContain('& {')
    expect(css).not.toContain('.b {\n    display: none')
  })
})

describe('C8 — multiple @nave directives keep authored order', () => {
  const extend: Record<string, AtomDefinition> = {
    first: { declarations: { color: 'red' }, pseudos: { ':hover': { color: 'blue' } } },
    second: { declarations: { color: 'green' }, pseudos: { ':hover': { color: 'yellow' } } },
  }

  it('emits the first directive nested rule before the second', async () => {
    const css = await run('.x { @nave first; @nave second; }', { extend })

    expect(css.indexOf('color: blue')).toBeLessThan(css.indexOf('color: yellow'))
  })

  it('emits declarations at the authored position of each directive', async () => {
    const css = await run('.x { @nave first; @nave second; }', { extend })

    expect(css.indexOf('color: red')).toBeLessThan(css.indexOf('color: green'))
  })
})

describe('declarations never follow a nested rule bare', () => {
  it('wraps declarations in & when the directive follows a consumer-authored nested rule', async () => {
    const css = await run('.card { &:hover { color: red; } @nave interactive; }')

    // The directive's authored position
    // was after `&:hover { … }`, so declarations landed bare after a nested
    // rule — the exact shape ADR 0001 forbids (needs CSSNestedDeclarations,
    // past the Baseline 2024 floor). They must be wrapped in `& { … }` instead.
    expect(css).toContain('&:hover')
    expect(css).toContain('cursor: pointer')
    expect(css).not.toMatch(/&:hover\s*\{[^}]*\}\s*cursor: pointer/)

    // No bare declaration should ever appear as a direct sibling after a
    // nested rule/at-rule inside the parsed output.
    const root = postcss.parse(css)
    root.walkRules((rule) => {
      let sawNested = false
      for (const node of rule.nodes) {
        if (node.type === 'rule' || node.type === 'atrule') sawNested = true
        else if (node.type === 'decl' && sawNested) {
          throw new Error(
            `bare declaration "${node.toString()}" follows a nested node in "${rule.selector}"`,
          )
        }
      }
    })
  })

  it('still inlines bare declarations at the directive position when nothing precedes it', async () => {
    const css = await run('.card { @nave interactive; &:hover { color: red; } }')

    expect(css).toContain('cursor: pointer')
    expect(css.indexOf('cursor: pointer')).toBeLessThan(css.indexOf('&:hover'))
  })

  it('wraps once for multiple atoms in one directive that follows a nested rule', async () => {
    const css = await run('.card { &:hover { color: red; } @nave flex itemsCenter; }')

    const block = css.slice(css.indexOf('&:hover'))
    // Exactly one `& {` wrapper carries both declarations, not one per atom.
    expect([...block.matchAll(/&\s*\{/g)]).toHaveLength(1)
    expect(block).toContain('display: flex')
    expect(block).toContain('align-items: center')
  })
})

describe('comma-separated pseudo keys are anchored on every branch', () => {
  const extend: Record<string, AtomDefinition> = {
    // A PLAIN (no embedded &) comma-separated key — the exact shape that silently
    // compiled to a descendant combinator on its second branch before this fix.
    twoBranchGate: {
      declarations: {},
      pseudos: {
        ':disabled, [data-inactive="true"]': { opacity: '0.4' },
      },
    },
  }

  it('anchors both branches of a plain comma-separated key with an explicit &', async () => {
    const css = await run('.x { @nave twoBranchGate; }', { extend })

    expect(css).toContain('&:disabled, &[data-inactive="true"]')
    // The pre-fix shape: only the first branch anchored, the second an implicit
    // descendant selector (a bare space before the bracket).
    expect(css).not.toMatch(/&:disabled,\s*\[data-inactive="true"\]/)
  })
})

describe('@nave outside a direct rule child is reported through onUnknown, not silently dropped', () => {
  it('rejects @nave nested inside @media with no intervening rule, by default (error)', async () => {
    await expect(
      run('.card { color: red; @media (width >= 37.5em) { @nave flex; } }'),
    ).rejects.toThrow(/must be the direct child of a CSS rule/)
  })

  it('warns and strips it under onUnknown: warn, leaving the rest of the block intact', async () => {
    const result = await postcss([navePlugin({ onUnknown: 'warn' })]).process(
      '.card { color: red; @media (width >= 37.5em) { @nave flex; } }',
      { from: undefined },
    )

    expect(result.warnings()[0]?.text).toMatch(/must be the direct child of a CSS rule/)
    expect(result.css).not.toContain('@nave')
    expect(result.css).not.toContain('display: flex')
    expect(result.css).toContain('color: red')
  })

  it('rejects @nave inside a @keyframes step, by default (error), even though the step parses as a rule', async () => {
    await expect(run('@keyframes k { to { @nave focusRing; } }')).rejects.toThrow(/@keyframes/)
  })

  it('warns and strips @nave inside @keyframes under onUnknown: warn', async () => {
    const result = await postcss([navePlugin({ onUnknown: 'warn' })]).process(
      '@keyframes k { to { @nave focusRing; } }',
      { from: undefined },
    )

    expect(result.warnings()[0]?.text).toMatch(/@keyframes/)
    expect(result.css).not.toContain('@nave')
    expect(result.css).not.toContain('focus-visible')
  })

  // Both placements above are pinned for 'error' and 'warn' but not for
  // 'ignore', even though both are routed through onUnknown "like an unknown
  // atom name" per the comments in postcss.ts — 'ignore' is that routing's
  // third mode and was left unpinned on these two placements.
  it('silently strips @nave nested inside @media with no intervening rule under onUnknown: ignore', async () => {
    const result = await postcss([navePlugin({ onUnknown: 'ignore' })]).process(
      '.card { color: red; @media (width >= 37.5em) { @nave flex; } }',
      { from: undefined },
    )

    expect(result.warnings()).toHaveLength(0)
    expect(result.css).not.toContain('@nave')
    expect(result.css).not.toContain('display: flex')
    expect(result.css).toContain('color: red')
  })

  it('silently strips @nave inside a @keyframes step under onUnknown: ignore', async () => {
    const result = await postcss([navePlugin({ onUnknown: 'ignore' })]).process(
      '@keyframes k { to { @nave focusRing; } }',
      { from: undefined },
    )

    expect(result.warnings()).toHaveLength(0)
    expect(result.css).not.toContain('@nave')
    expect(result.css).not.toContain('focus-visible')
  })
})

describe('isInsideKeyframes matches "at any depth", not just a direct step', () => {
  it('rejects inside a vendor-prefixed @-webkit-keyframes block', async () => {
    await expect(run('@-webkit-keyframes k { to { @nave focusRing; } }')).rejects.toThrow(
      /@keyframes/,
    )
  })

  it('rejects inside a percentage step, not just the named to/from steps', async () => {
    await expect(run('@keyframes k { 50% { @nave focusRing; } }')).rejects.toThrow(/@keyframes/)
  })

  it('rejects when the directive is nested more than one hop below the keyframe step', async () => {
    await expect(run('@keyframes k { to { .foo { @nave focusRing; } } }')).rejects.toThrow(
      /@keyframes/,
    )
  })

  // The negative direction, so the /@keyframes/ assertions above cannot be
  // satisfied by a regex that over-matches any at-rule ending in that word:
  // @supports is unrelated to @keyframes and must resolve normally.
  it('does not misfire on an unrelated at-rule ancestor such as @supports', async () => {
    const css = await run('@supports (display: grid) { .card { @nave flex; } }')

    expect(css).toContain('display: flex')
  })
})

describe('generated nodes carry the directive source', () => {
  it('stamps every declaration, wrapper rule and nested at-rule block with the @nave directive source', async () => {
    const result = await postcss([navePlugin()]).process('.card { @nave hidePhoneOnly; }', {
      from: 'src/app.css',
    })

    const untraced: string[] = []
    result.root.walk((node) => {
      if (!node.source) untraced.push(node.toString())
    })
    expect(untraced).toEqual([])
  })

  // The test above uses hidePhoneOnly, whose declarations object is `{}`, so
  // it exercises only the nested-at-rule stamping path (stampSource) and
  // never reaches the two other places postcss.ts assigns `.source`: the
  // bare-declaration loop and the `& { … }` wrapper built by
  // insertDeclarations. Pinned separately so a regression on either
  // assignment is caught here rather than passing the suite unnoticed.
  it('stamps a bare declaration inlined at the directive position with the @nave directive source', async () => {
    const result = await postcss([navePlugin()]).process('.card { @nave flex; }', {
      from: 'src/app.css',
    })

    const untraced: string[] = []
    result.root.walk((node) => {
      if (!node.source) untraced.push(node.toString())
    })
    expect(untraced).toEqual([])
  })

  it('stamps the & { … } wrapper rule with the @nave directive source when the directive follows a nested node', async () => {
    const result = await postcss([navePlugin()]).process(
      '.card { &:hover { color: red; } @nave flex; }',
      { from: 'src/app.css' },
    )

    const untraced: string[] = []
    result.root.walk((node) => {
      if (!node.source) untraced.push(node.toString())
    })
    expect(untraced).toEqual([])
  })
})

describe('@nave base behaviour', () => {
  it('inlines declarations and removes the directive', async () => {
    const css = await run('.x { @nave flex itemsCenter; }')

    expect(css).toContain('display: flex')
    expect(css).toContain('align-items: center')
    expect(css).not.toContain('@nave')
  })

  it('throws on an unknown atom when onUnknown is error', async () => {
    await expect(run('.x { @nave nope; }', { onUnknown: 'error' })).rejects.toThrow(/unknown atom/)
  })

  it('rejects @nave sitting outside any rule at all, by default (error)', async () => {
    await expect(run('@nave flex;')).rejects.toThrow(/must be the direct child of a CSS rule/)
  })

  it('warns instead when @nave sits outside any rule under onUnknown: warn', async () => {
    const result = await postcss([navePlugin({ onUnknown: 'warn' })]).process('@nave flex;', {
      from: undefined,
    })

    expect(result.warnings()[0]?.text).toMatch(/must be the direct child of a CSS rule/)
  })
})

describe('onUnknown default is error', () => {
  it('rejects an unknown atom with no options object passed at all', async () => {
    // No options argument whatsoever (not even `{}`): a mistyped @nave atom
    // name must fail the build loudly by default, not silently emit a rule
    // with no declarations.
    await expect(run('.x { @nave nope; }')).rejects.toThrow(/unknown atom/)
  })

  it('resolves cleanly for a consumer-supplied atom via extend, with no onUnknown key set', async () => {
    const extend: Record<string, AtomDefinition> = {
      brandBox: { declarations: { color: 'red' } },
    }

    const result = await postcss([navePlugin({ extend })]).process('.x { @nave brandBox; }', {
      from: undefined,
    })

    expect(result.css).toContain('color: red')
    expect(result.css).not.toContain('@nave')
    expect(result.warnings()).toHaveLength(0)
  })

  it('warns instead of throwing when onUnknown is explicitly warn', async () => {
    const result = await postcss([navePlugin({ onUnknown: 'warn' })]).process(
      '.x { @nave nope; }',
      { from: undefined },
    )

    expect(result.warnings()[0]?.text).toMatch(/unknown atom/)
    expect(result.css).not.toContain('@nave')
  })

  // F5 — a directive that names no atom at all is the same silent empty rule
  // this PR exists to remove, one construction to the left.
  it('rejects a @nave directive that names no atom at all', async () => {
    await expect(run('.x { @nave; }')).rejects.toThrow(/directive names no atom/)
  })

  // F2 — an extend KEY with no definition passes the unknown check (Object.keys
  // includes it) and is then swallowed by `if (!atom) return []`. BOTH spellings
  // ride one row on purpose: JSON cannot express `undefined`, so a JSON-authored
  // or JSON-transported atom map can only produce the second shape, and a filter
  // that closes one spelling while leaving the other open must red here rather
  // than pass on the half it happens to cover.
  it('rejects an extend key registered with no definition, spelled undefined or null', async () => {
    const spelledUndefined = { brandBox: undefined } as unknown as Record<string, AtomDefinition>
    const spelledNull = JSON.parse('{"brandBox":null}') as Record<string, AtomDefinition>

    await expect(run('.x { @nave brandBox; }', { extend: spelledUndefined })).rejects.toThrow(
      /unknown atom/,
    )
    await expect(run('.x { @nave brandBox; }', { extend: spelledNull })).rejects.toThrow(
      /unknown atom/,
    )
  })

  // F4 — an unrecognised onUnknown value must not select the most permissive mode.
  it('does not fall open to silence when onUnknown carries an unrecognised value', async () => {
    const options = { onUnknown: 'ERROR' } as unknown as Parameters<typeof navePlugin>[0]

    await expect(run('.x { @nave nope; }', options)).rejects.toThrow(/unknown atom/)
  })

  // F3 — a registered but malformed atom must fail with a positioned PostCSS
  // error naming it, not a bare TypeError carrying no file, line or column.
  // EVERY non-plain-object spelling rides one row, for the reason the extend-key
  // row above states: a guard that closes one spelling while leaving another
  // open must red here. `typeof x !== 'object'` alone admits `null`; adding
  // `!== null` still admits an ARRAY, which reaches `Object.entries` and emits
  // either nothing or declarations named after the array's own indices. Each
  // shape is registered under its own atom name so the thrown message says
  // which spelling failed.
  it('rejects an extend atom whose declarations is not a plain object, in every spelling', async () => {
    const shapes = {
      missing: {},
      nulled: JSON.parse('{"declarations":null}'),
      emptyArray: { declarations: [] },
      filledArray: { declarations: ['color: red'] },
      primitive: { declarations: 'color: red' },
    } as unknown as Record<string, AtomDefinition>

    for (const [name, atom] of Object.entries(shapes)) {
      await expect(run(`.x { @nave ${name}; }`, { extend: { [name]: atom } })).rejects.toThrow(
        new RegExp(`atom "${name}" is registered without a declarations object`),
      )
    }
  })

  // The third documented mode, unpinned anywhere before this row. The known-atom
  // clause is what makes it a check rather than a tautology: it distinguishes
  // "skip the unknown name" from "skip the whole directive".
  it('silently skips an unknown atom when onUnknown is ignore, and still resolves the known ones', async () => {
    const result = await postcss([navePlugin({ onUnknown: 'ignore' })]).process(
      '.x { @nave flex nope; }',
      { from: undefined },
    )

    expect(result.warnings()).toHaveLength(0)
    expect(result.css).toContain('display: flex')
    expect(result.css).not.toContain('@nave')
  })

  // The diagnostic IS the ground for defaulting to 'error' rather than 'warn':
  // a build that fails must say WHERE. `rejects.toThrow(/unknown atom/)` alone
  // stays green when `atRule.error(msg)` is replaced by a bare `new Error(msg)`,
  // which strips the file, the line and the column.
  //
  // Column 9, not 3 (this file's pin before the slice-1 changeset): R6 positions
  // `unknown-atom` at the name token, not at the directive's `@` (round-3
  // decision 4, AC-directive-core-13).
  it('fails by default with a PostCSS CssSyntaxError carrying the directive line and column', async () => {
    const source = '.x {\n  color: blue;\n  @nave nope;\n}'

    await expect(
      postcss([navePlugin()]).process(source, { from: 'src/app.css' }),
    ).rejects.toMatchObject({ name: 'CssSyntaxError', line: 3, column: 9 })
  })

  // The other half of the same ground: the error names the vocabulary the typo
  // missed, INCLUDING the consumer's own extend atoms — now via R6's hint rule
  // rather than the `Available:` list (this file's pin before the slice-1
  // changeset asserted the old `Available: .*brandBox` text; "brandBoxx" is
  // now a distance-1 typo of the extend atom "brandBox" itself).
  it('names the consumer extend atoms in the Available list when the typo is on an extension', async () => {
    const extend: Record<string, AtomDefinition> = {
      brandBox: { declarations: { color: 'red' } },
    }

    await expect(run('.x { @nave brandBoxx; }', { extend })).rejects.toThrow(
      /unknown atom "brandBoxx"\. Did you mean "brandBox"\?/,
    )
  })

  // Prototype-chain safety, pinned in both directions. The valid-name set is
  // built from own enumerable keys, so `@nave toString` with no extend is
  // unknown and fails; a `name in allAtoms` or `allAtoms[name] !== undefined`
  // check would pass it. The second half pins that a consumer CAN still name an
  // atom `toString` via extend.
  it('treats inherited Object prototype names as unknown, and still resolves one supplied via extend', async () => {
    await expect(run('.x { @nave toString; }')).rejects.toThrow(/unknown atom "toString"/)
    await expect(run('.x { @nave constructor; }')).rejects.toThrow(/unknown atom "constructor"/)

    const extend: Record<string, AtomDefinition> = {
      toString: { declarations: { color: 'red' } },
    }

    expect(await run('.x { @nave toString; }', { extend })).toContain('color: red')
  })

  // A prototype-chain name resolved past validAtomNames (onUnknown modes
  // other than 'error' keep going after reportUnknown) must not fall through to
  // the "registered without a declarations object" crash. Same class as the
  // 'error' pin above, extended across the other two modes.
  it('warns cleanly (not the malformed-atom crash) for a prototype-chain name under onUnknown: warn', async () => {
    const result = await postcss([navePlugin({ onUnknown: 'warn' })]).process(
      '.x { @nave toString; }',
      { from: undefined },
    )

    expect(result.warnings()).toHaveLength(1)
    expect(result.warnings()[0]?.text).toMatch(/unknown atom "toString"/)
    expect(result.css).not.toContain('@nave')
  })

  it('silently skips a prototype-chain name under onUnknown: ignore, without throwing', async () => {
    const result = await postcss([navePlugin({ onUnknown: 'ignore' })]).process(
      '.x { @nave toString; }',
      { from: undefined },
    )

    expect(result.warnings()).toHaveLength(0)
    expect(result.css).not.toContain('@nave')
  })

  // The empty directive is REPORTED through `onUnknown`, not around it, which is
  // what the changeset says it does. Nothing else in this file pins the routing:
  // a branch that threw unconditionally leaves every other row here green.
  it('routes a @nave directive naming no atom through onUnknown, not around it', async () => {
    const warned = await postcss([navePlugin({ onUnknown: 'warn' })]).process('.x { @nave; }', {
      from: undefined,
    })

    expect(warned.warnings()).toHaveLength(1)
    expect(warned.warnings()[0]?.text).toMatch(/directive names no atom/)
    expect(warned.css).not.toContain('@nave')

    const ignored = await postcss([navePlugin({ onUnknown: 'ignore' })]).process('.x { @nave; }', {
      from: undefined,
    })

    expect(ignored.warnings()).toHaveLength(0)
    expect(ignored.css).not.toContain('@nave')
  })

  // The truthiness filter runs over the MERGED map, so an extend key carrying no
  // definition does not merely fail to add an atom: it REMOVES the built-in it
  // collides with, and that name leaves the `Available:` list with it. Refused
  // loudly rather than silently emitted, which is what this PR is for; the
  // second assertion is the control that the built-in is otherwise there.
  it('refuses a built-in atom shadowed by an extend key with no definition', async () => {
    const extend = { flex: undefined } as unknown as Record<string, AtomDefinition>

    await expect(run('.x { @nave flex; }', { extend })).rejects.toThrow(/unknown atom "flex"/)
    expect(await run('.x { @nave flex; }')).toContain('display: flex')
  })
})
