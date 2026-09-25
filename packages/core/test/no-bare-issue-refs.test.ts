/**
 * Pinning row for the Phase 3 review round 2 cleanup: a bare `#<digits>` issue reference in
 * this package's tracked sources resolves, on the public repository, against the PUBLIC repo's
 * own issue/PR tracker, not against the private brain issue the author meant. Only a reference
 * that genuinely names a public `temp-navecss` PR may be written bare; every other bare number
 * silently points a reader at an unrelated PR on the public repo.
 *
 * Enumerates every file `git ls-files` tracks under `packages/core/` (never a directory walk,
 * so gitignored `dist/`, `node_modules/`, `coverage/` are excluded for free, they are never
 * tracked in the first place) and asserts that no bare `#<digits>` appears anywhere, with no
 * exceptions. Two numbers naming pull requests of the repository this code is developed in
 * today were once allowed; that allowance is withdrawn, because the public repository starts
 * from fresh history and those numbers will name unrelated items there rather than nothing.
 * Failures are reported as sites (file:line), not as a bare set of numbers.
 *
 * Two bounds keep this from false-redding on a CSS hex colour; the regex comment below has the
 * full rationale. In summary: the digit run is capped at four, and `.css` files are skipped
 * from this scan entirely, because an all-decimal hex colour is shaped exactly like an issue
 * number. A sibling assertion further down closes the gap that skip opens (a bare reference
 * written inside a CSS *comment*, where no hex colour can ever occur) by scanning only the
 * comment bodies of those skipped files.
 *
 * THIS GUARD USED TO STOP THERE, AND THAT WAS A LATENT DEFECT IN ITS OWN RIGHT. Excluding `.css`
 * files handles the ONE false-positive class a hex colour in a declaration produces, but a hex
 * literal, an HTML numeric character reference, a URL/SVG fragment or a quoted colour argument
 * can all appear in a `.ts` source file too — and this package was clean under the old check
 * only by LUCK: it happens to carry no such literal outside `.css` today, while its sibling
 * `packages/tokens/` holds dozens. The first colour fixture a core contributor adds would have
 * false-redded this guard while the repo-wide guard at
 * `scripts/check-no-bare-issue-refs.test.mjs` correctly passed it, on identical bytes. The
 * predicate below (`isLawfulNonReference` and everything it depends on) closes that gap by
 * porting the repo-wide guard's exclusion logic here.
 *
 * WHY DUPLICATED RATHER THAN IMPORTED.
 * `scripts/check-no-bare-issue-refs.test.mjs` is the CANONICAL copy — read
 * its docblock for the full rationale behind every clause below, this file states only what
 * differs. A package test importing a helper from repo-root `scripts/` would add a build-graph
 * edge that the publishable-set and no-inlined-dependency guards would then have to learn about:
 * `packages/core/`'s published artifact must not reach outside its own package boundary, and
 * `scripts/` is not something `pnpm publish` ever sees, so the import would either have to be
 * stripped at build time (a special case those guards do not currently carry) or would leak a
 * dev-only path into a package that is supposed to depend on nothing but `tokens`. Twenty-odd
 * lines of duplicated predicate logic is cheaper than teaching two unrelated guards about one
 * test-only exception, and a test file is exactly the kind of code where duplication has no
 * runtime cost to pay for. Both copies carry the SAME both-direction pinning rows (below) so
 * that a change to one which is not mirrored in the other shows up as a local red here rather
 * than as silent drift between the two.
 */
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { Worker } from 'node:worker_threads'

import { describe, expect, it } from 'vitest'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..')
const PACKAGE_DIR = 'packages/core/'

/** A bare `#<digits>`, excluded when the character right before `#` is a word character — the
 * shape a fully qualified `owner/repo#N` reference (e.g. `owner/repo#N`) always has right there,
 * since `repo` ends in a word character. Nothing else is excused by this lookbehind; a URL or SVG
 * fragment identifier is handled separately, by `isLawfulNonReference`'s own `url(`/`href=` clause
 * below.
 *
 * THE CLASS USED TO ALSO CARRY `-` AND `/` MEMBERS, BOTH REMOVED because they excluded the wrong
 * population: a qualified reference's repo segment ends in a word character, never a bare hyphen
 * or slash, so neither excluded a single qualified spelling. What `-` silently excluded instead
 * was this repository's own hyphenated-prefix prose for "before/after issue N" (a hyphen directly
 * followed by a bare reference, e.g. `pre-` or `post-` immediately before the `#`), and what `/`
 * silently excluded was prose ending a path-like segment directly before a bare reference (e.g.
 * `R27/` immediately before the `#`). Both are the bare form this guard exists to catch. Mirrors
 * the canonical copy's removal in `scripts/check-no-bare-issue-refs.test.mjs`; see that file's
 * docblock for the full rationale.
 *
 * The digit run is capped at four, and `.css` files are skipped entirely (below), for one
 * reason: a CSS hex colour is also a `#` followed by digits, and an all-decimal one
 * (`#123456`, `#001122`) is indistinguishable from an issue number by shape alone. Without
 * both bounds, adding a perfectly lawful colour to this package reds this check with a
 * message about issue references, which is the false red that teaches a reader to skip a
 * gate. Four digits is a deliberate bound rather than an open one: it covers every issue
 * number this repository can reach for the life of this pin (it is in the low hundreds),
 * while excluding the 6- and 8-digit hex forms outright. The 3- and 4-digit hex shorthands
 * are what the `.css` skip covers, since that is the only place this package writes them. */
const BARE_ISSUE_REF = /(?<!\w)#(\d{1,4})(?!\d)/g

/**
 * A `#` followed by digits that is lawfully NOT an issue reference. Ported from
 * `scripts/check-no-bare-issue-refs.test.mjs` (the canonical copy — see the docblock above for
 * why this is a duplicate rather than an import). Judged on the characters around the match
 * rather than on the number, because the number carries no information: the same three digits
 * are a colour in one file and an issue reference in another.
 *
 * ONE RESIDUAL FAMILY STAYS EXCLUDED, AND NO RULE KEYED ON SURROUNDING CHARACTERS CAN CLOSE IT,
 * because in each member the bytes are genuinely ambiguous rather than merely under-classified.
 * Three shapes belong to it: a quoted three-digit token (`ingestSeed('#123')`, where the quoted
 * digits are a real three-digit colour written identically to a quoted reference); a
 * six-character run right after the digits (`#150abc`, a real hex-colour spelling of that width,
 * indistinguishable from a three-digit reference followed by three unrelated letters); and a bare
 * colour-property value (`outline: #150`, which stays valid CSS under the exact declaration
 * syntax a bare reference would sit in). In every member the digits carry no information at
 * all — only the surrounding context does — and in these three the context reads identically for
 * a colour and for a reference, which is the guard's own point turned back on itself. This is a
 * bounded, known residual of one shape, not a gap to be closed by widening the exclusions
 * further: widening is exactly how the earlier count-pinned version of this guard bought a lower
 * count by going blind, and re-opening that path here would trade a named residual for an unnamed
 * one.
 */
const CSS_VALUE_KEYWORDS = [
  // border/outline shorthand styles — the actual value grammar of the properties this regex
  // gates on (`border`, `outline`).
  'solid',
  'dashed',
  'dotted',
  'double',
  'groove',
  'ridge',
  'inset',
  'outset',
  'hidden',
  'none',
  // generic CSS-wide keywords that can legitimately sit in a colour-bearing value.
  'transparent',
  'currentcolor',
  'inherit',
  'initial',
  'unset',
  'revert',
  'auto',
].join('|')

/** The value segment between a colour property/function's operator and the `#` under test has
 * to look like an actual CSS value — whitespace, punctuation, numbers with units, hex tokens, a
 * function name immediately followed by `(`, or the small keyword set above — never open-ended
 * prose. This is what stops a colour keyword earlier on a line from excusing an unrelated real
 * reference written later on the SAME line (a hex colour value followed by ", see " and a bare
 * reference, all on one `background:` line, must still report the reference), which an earlier
 * `[^;{]*$` tail did not catch. */
// The numeric branch is forced MAXIMAL with a trailing `(?![\d.])`: without it, `\d+` sitting
// inside an alternation that is itself starred lets a run of N digits be partitioned in 2^(N-1)
// ways, and when the tail then fails to reach `$` the engine walks every partition before giving
// up — a committed line carrying 35+ consecutive digits followed by prose hangs the process
// rather than reporting the reference. The lookahead refuses any partition that stops short of
// the run's actual end, so there is only ever one way to consume a digit run and the exponential
// blow-up has nothing left to branch on. See the linearity test below for the measured
// before/after; mirrors the canonical copy in `scripts/check-no-bare-issue-refs.test.mjs`.
const CSS_VALUE_TOKEN = String.raw`(?:\s|[,()'"/]|\d+(?:\.\d+)?[a-z%]*(?![\d.])|#[0-9a-fA-F]+|[a-zA-Z][\w-]*(?=\()|\b(?:${CSS_VALUE_KEYWORDS})\b)`

/** A colour written in a CSS declaration, a presentation attribute, or a colour function
 * (including `light-dark(...)`), where the property or function name immediately before the
 * `#` says what the digits are, and the value segment in between is bounded by `;`, `{` and `}`
 * as well as by the value-shape gate above. */
const COLOUR_DECLARATION = new RegExp(
  String.raw`(?:color|background|border|outline|fill|stroke|shadow|gradient|light-dark)[\w-]*\s*[:(=]\s*${CSS_VALUE_TOKEN}*$`,
  'i',
)

const HEX_WIDTHS = new Set([3, 4, 6, 8])

function isLawfulNonReference(text: string, matchIndex: number, digits: string): boolean {
  // An issue number never carries a leading zero, so `#0`, `#000` and `#00ff00` are colours.
  if (digits.startsWith('0')) return true

  const after = text.slice(matchIndex + 1 + digits.length)
  // A hex letter (or digit) straight after the digit run means the match MAY be a prefix of a
  // longer hex token (`#3366ff`, `#2d6`, `#222D5C`) — but only excuse it when digits-plus-run
  // together form a token of a REAL hex-colour width (3, 4, 6 or 8). A five- or seven-character
  // run is not spellable as a CSS hex colour at all, so nothing legitimate is protected by
  // excusing it, and it reports. A six-character run stays excused: it genuinely is six valid
  // hex characters and a real hex-colour spelling, and no rule keyed on the surrounding
  // characters can tell it apart from a reference — this bounds the impossible widths only, it
  // does not and cannot claim to close the shape.
  // The pattern matches an empty run too (`*`), so `.exec()` never returns null here.
  const trailingHex = /^[0-9a-fA-F]*/.exec(after)![0]
  if (trailingHex.length > 0 && HEX_WIDTHS.has(digits.length + trailingHex.length)) return true

  const before = text.slice(0, matchIndex)
  // An HTML numeric character reference: `&#8202;`.
  if (before.endsWith('&')) return true
  // A URL or SVG fragment identifier: `url(#123)`, `href="#123"`, `xlink:href='#456'`.
  if (/(?:url\(|href\s*=\s*["'])$/i.test(before)) return true
  // A colour written in a CSS declaration, a presentation attribute, or a colour function.
  if (COLOUR_DECLARATION.test(before)) return true
  // A quoted token that is nothing but digits of a hex-colour width: `'#123'`, `"#2d6"`. The
  // closing quote has to match the opening one and follow the digits directly, so a reference
  // quoted inside a sentence, with prose either side of it, is untouched.
  const quote = before.slice(-1)
  return (
    (quote === "'" || quote === '"') && after.startsWith(quote) && HEX_WIDTHS.has(digits.length)
  )
}

function listAllTrackedCoreFiles(): string[] {
  return execFileSync('git', ['ls-files', '-z', '--', PACKAGE_DIR], {
    cwd: ROOT,
    encoding: 'utf8',
  })
    .split('\0')
    .filter((line) => line.length > 0)
}

function listTrackedCoreFiles(): string[] {
  return listAllTrackedCoreFiles().filter((file) => !file.endsWith('.css'))
}

function listTrackedCoreCssFiles(): string[] {
  return listAllTrackedCoreFiles().filter((file) => file.endsWith('.css'))
}

/** Bare issue numbers found in a single LINE, paired with lawfulness judged against that same
 * line — matching the repo-wide guard's per-line scoping, so the two copies agree on any text
 * that spans more than one physical line differently. */
function sitesInLine(line: string): number[] {
  return line
    .matchAll(BARE_ISSUE_REF)
    .filter((match) => !isLawfulNonReference(line, match.index ?? 0, match[1]!))
    .map((match) => Number(match[1]))
    .toArray()
}

/** Matches a `/* ... *\/` block and captures its body, across as many lines as the comment
 * spans. Used only to re-scan the `.css` files the main check skips: a comment body can never
 * contain a lawful hex colour (those only occur in declarations), so running `BARE_ISSUE_REF`
 * against comment bodies excludes hex colours by construction, with no digit-count guesswork. */
const CSS_COMMENT = /\/\*([\s\S]*?)\*\//g

function lineNumberAt(text: string, index: number): number {
  return text.slice(0, index).split('\n').length
}

/** Bare issue numbers found inside `/* ... *\/` comment bodies only, paired with the 1-based
 * line each occurs on (computed from the absolute offset, since a comment body can span
 * several lines). Declarations (where a hex colour could appear) are never visited. */
function findBareIssueSitesInCssComments(text: string): { line: number; n: number }[] {
  const sites: { line: number; n: number }[] = []
  for (const comment of text.matchAll(CSS_COMMENT)) {
    const body = comment[1] ?? ''
    const bodyStart = (comment.index ?? 0) + 2
    for (const ref of body.matchAll(BARE_ISSUE_REF)) {
      const digits = ref[1]!
      if (!isLawfulNonReference(body, ref.index ?? 0, digits)) {
        sites.push({ line: lineNumberAt(text, bodyStart + (ref.index ?? 0)), n: Number(digits) })
      }
    }
  }
  return sites
}

describe('no bare issue reference misresolves against the public repository', () => {
  it('every bare #N under packages/core/ is a lawful non-reference (colour, URL fragment, etc.) or nothing at all', () => {
    const offenders: string[] = []

    for (const relPath of listTrackedCoreFiles()) {
      const lines = readFileSync(path.join(ROOT, relPath), 'utf8').split('\n')
      for (const [index, line] of lines.entries()) {
        for (const n of sitesInLine(line)) offenders.push(`${relPath}:${index + 1}  #${n}`)
      }
    }

    // Reported as SITES rather than as a set of numbers: a red naming only the numbers leaves
    // the reader to grep for them, and a gate whose failure is work to read is a gate that
    // gets skipped. Asserted as "nothing disallowed" rather than as set equality, so that
    // deleting or rewording a comment that happens to carry one of the allowed references is
    // not itself a failure; the property pinned here is the absence of a bad reference, never
    // the continued presence of a good one.
    expect(
      offenders,
      'a bare #N in this repository resolves against the PUBLIC repository, so only a ' +
        'reference that genuinely names a public PR may be written bare; anything else ' +
        'silently points a reader at an unrelated PR. State the reason in words and drop the ' +
        'number; no qualified spelling is admissible either, since this repository starts ' +
        'from fresh history and its own numbers will name unrelated items',
    ).toEqual([])
  })

  it('every bare #N inside a CSS comment under packages/core/ is a lawful non-reference or nothing at all', () => {
    // Closes the gap the `.css` skip above opens: the main check never visits `.css` files at
    // all, because an all-decimal hex colour in a declaration is indistinguishable from an
    // issue number by shape. A bare private reference written in a CSS *comment* would
    // therefore go unseen. No hex colour ever occurs inside a comment body, so scanning only
    // comment bodies (never declarations) excludes that false red by construction, with no
    // need for the digit-count guesswork the main check relies on.
    const offenders: string[] = []

    for (const relPath of listTrackedCoreCssFiles()) {
      const text = readFileSync(path.join(ROOT, relPath), 'utf8')
      for (const { line, n } of findBareIssueSitesInCssComments(text)) {
        offenders.push(`${relPath}:${line}  #${n}`)
      }
    }

    expect(
      offenders,
      'a bare #N in a CSS comment resolves against the PUBLIC repository just like anywhere ' +
        'else; state the reason in words and drop the number',
    ).toEqual([])
  })
})

// BOTH-DIRECTION PINNING ROWS, mirroring `scripts/check-no-bare-issue-refs.test.mjs` exactly so
// the two copies of `isLawfulNonReference` are pinned to agree on the same fixtures; the same
// digits are used throughout for direct comparability with the canonical copy.
//
// A bare fixture has to be COMPOSED rather than written literally, for the identical reason the
// canonical copy states: this file lives under `packages/core/`, which the scan above enumerates
// via `git ls-files`, so a literal bare digit sequence here would be counted by this file's OWN
// scan and would make the guard report its own fixtures as offenders.
const HASH = '#'

describe('isLawfulNonReference: the excluded shapes (ported, both directions)', () => {
  const lawful: [string, string][] = [
    [`$value: '${HASH}000'`, 'three-digit hex, leading zero'],
    [`brand: { x: { $type: 'color', $value: '${HASH}00ff00' } }`, 'six-digit hex, leading zero'],
    [
      `'light-dark(${HASH}fff, ${HASH}000)'`,
      'hex pair inside a colour function (leading-zero half only; the first argument has no ' +
        'digits at all and the second short-circuits on the leading-zero rule, so this does not ' +
        'reach the light-dark clause — see the non-zero-leading row below for real coverage)',
    ],
    [`const seed = '${HASH}3366ff'`, 'six-digit hex whose first four characters are digits'],
    [`{ input: '${HASH}2d6', label: '3-digit hex' }`, 'three-digit hex ending in a letter'],
    [`\`${HASH}3366ff\` is what they typed`, 'hex token inside prose'],
    [`'&${HASH}8202;'`, 'numeric character reference'],
    [`'background: url(${HASH}123);'`, 'url() fragment'],
    [`'<use href="${HASH}123" />'`, 'href fragment'],
    [`"<use xlink:href='${HASH}456' />"`, 'xlink:href fragment'],
    [`body { background: ${HASH}f6f6f6; color: ${HASH}111; }`, 'colour declaration'],
    [`background: linear-gradient(${HASH}111, ${HASH}222)`, 'colour inside a gradient'],
    [`outline: 2px solid ${HASH}123`, 'colour in a shorthand declaration'],
    [`<rect fill="${HASH}369" />`, 'colour in a presentation attribute'],
    [`const actual = ingestSeed('${HASH}123')`, 'quoted three-digit colour argument'],
    [
      `'light-dark(${HASH}123, ${HASH}456)'`,
      'light-dark clause exercised with non-zero-leading digits',
    ],
    [`see ${HASH}3366ff here`, 'hex-letter-after width 6 (4 digits + 2 letters)'],
    [`see ${HASH}2d6 here`, 'hex-letter-after width 3 (1 digit + 2 hex chars)'],
    [`see ${HASH}2d6f here`, 'hex-letter-after width 4 (1 digit + 3 hex chars)'],
    [`see ${HASH}27d4c6 here`, 'hex-letter-after width 6 (2 digits + 4 hex chars)'],
    [`see ${HASH}27d4c6ff here`, 'hex-letter-after width 8 (2 digits + 6 hex chars)'],
    [`see ${HASH}222D5C here`, 'hex-letter-after width 6, mixed case'],
    [`see ${HASH}2f6feb here`, 'hex-letter-after width 6 (1 digit + 5 hex chars)'],
    [`see ${HASH}19D3C5 here`, 'hex-letter-after width 6, mixed case'],
    [`see ${HASH}3355ff here`, 'hex-letter-after width 6 (4 digits + 2 letters)'],
    [
      `see ${HASH}150abc for the tag`,
      'hex-letter-after width 6 — the acknowledged residual, stays excluded',
    ],
  ]

  for (const [sample, shape] of lawful) {
    it(`lawful, not a reference: ${shape}`, () => {
      expect(sitesInLine(sample), `${shape} must not be reported: ${sample}`).toEqual([])
    })
  }

  const reported: [string, number[], string][] = [
    [`Fixed: ${HASH}150`, [150], 'a colon-prefixed prose reference'],
    [`see ${HASH}343 for the ruling`, [343], 'a mid-sentence reference'],
    [`(${HASH}150)`, [150], 'a parenthesised reference'],
    [`Refs ${HASH}452`, [452], 'a trailer-style reference'],
    [`round 20, ${HASH}407`, [407], 'a reference after a comma'],
    [
      `background: ${HASH}fff, see ${HASH}150 for details`,
      [150],
      'prose after a real colour value, on the same declaration, must still report',
    ],
    [
      `the shadow: cast by ${HASH}150 was long`,
      [150],
      'a colour keyword used as an ordinary English word must not excuse a later reference',
    ],
    [
      `a { color: red } fixed in ${HASH}150`,
      [150],
      'a closed declaration block does not extend past its own closing }',
    ],
    [
      `color: red; fixed in ${HASH}150`,
      [150],
      'control: a `;`-terminated declaration already reported correctly before this fix',
    ],
    [
      `see ${HASH}150ab for the tag`,
      [150],
      'digits + trailing hex run = 5 characters, not a real hex width',
    ],
    [
      `see ${HASH}150abcd for the tag`,
      [150],
      'digits + trailing hex run = 7 characters, not a real hex width',
    ],
    [
      `foo(${HASH}123, ${HASH}456)`,
      [123, 456],
      'an unrecognised function name must not borrow the light-dark exclusion',
    ],
    // The class used to also carry `-` and `/` members, which excluded these shapes by mistake
    // (see the docblock above `BARE_ISSUE_REF` for the full history). Pinned here so the class
    // cannot quietly regain either one.
    [`the pre-${HASH}219 shape`, [219], 'a hyphenated "before" prefix'],
    [`the post-${HASH}204 shape`, [204], 'a hyphenated "after" prefix'],
    [`see a/${HASH}123 here`, [123], 'a slash immediately before the hash, bare prose'],
    [`the R27/${HASH}409 measurement`, [409], 'the same shape citing a requirement number'],
  ]

  for (const [sample, expected, shape] of reported) {
    it(`still reported: ${shape}`, () => {
      expect(sitesInLine(sample), shape).toEqual(expected)
    })
  }

  it('qualified forms are excluded, and the same number written bare is not', () => {
    const qualified = `see owner/repo${HASH}343, some-owner/some-repo${HASH}102 and repo${HASH}74`
    expect(qualified.matchAll(BARE_ISSUE_REF).toArray()).toEqual([])
    expect(sitesInLine(`see ${HASH}343 for the ruling`)).toEqual([343])
  })

  // The lookbehind's whole contract, pinned as a property rather than as the two characters it
  // has already had to lose: no character other than a word character directly before the hash
  // excludes a reference. A new punctuation member added to the class reds here even before any
  // site in the tree uses that spelling.
  it('only a word character directly before the hash excludes a reference', () => {
    const nonWord = [
      '/',
      '-',
      '.',
      ',',
      ';',
      ':',
      '!',
      '?',
      '@',
      '$',
      '%',
      '^',
      '&',
      '*',
      '+',
      '=',
      '~',
      '`',
      '|',
      '<',
      '>',
      '(',
      ')',
      '[',
      ']',
      '{',
      '}',
      '"',
      "'",
      '\\',
      ' ',
    ]
    for (const c of nonWord) {
      expect(
        `x${c}${HASH}12 y`
          .matchAll(BARE_ISSUE_REF)
          .map((m) => m[1])
          .toArray(),
        `${JSON.stringify(c)} directly before the hash must not excuse a reference`,
      ).toEqual(['12'])
    }
    for (const c of ['a', 'Z', '0', '_']) {
      expect(
        `x${c}${HASH}12 y`.matchAll(BARE_ISSUE_REF).toArray(),
        `${JSON.stringify(c)} is a word character and still excludes the reference`,
      ).toEqual([])
    }
  })
})

/**
 * Runs `COLOUR_DECLARATION.test(input)` inside a worker thread and resolves with the elapsed
 * milliseconds, or `null` if it has not finished within `timeoutMs`. A hard `timeoutMs` bound on
 * `COLOUR_DECLARATION.test()` itself cannot be enforced on the MAIN thread: the call is
 * synchronous and, when it backtracks catastrophically, blocks the event loop outright, so a
 * `setTimeout` racing it on the same thread never gets to fire. Running it inside a `Worker` and
 * calling `worker.terminate()` from a timer on the main thread is the only way to bound it for
 * real, which is exactly why this helper exists instead of a plain `Promise.race`. The regex
 * source and flags are read off the live `COLOUR_DECLARATION` (never re-typed), so this test
 * cannot silently stop covering the actual regex if a future edit changes it. Mirrors the
 * canonical copy's helper in `scripts/check-no-bare-issue-refs.test.mjs`.
 */
function measureColourDeclarationOnWorker(
  input: string,
  timeoutMs: number,
): Promise<number | null> {
  return new Promise((resolve) => {
    const workerSource = `
      const { parentPort, workerData } = require('node:worker_threads')
      const re = new RegExp(workerData.source, workerData.flags)
      const t0 = Date.now()
      re.test(workerData.input)
      parentPort.postMessage(Date.now() - t0)
    `
    const worker = new Worker(workerSource, {
      eval: true,
      workerData: { source: COLOUR_DECLARATION.source, flags: COLOUR_DECLARATION.flags, input },
    })
    let settled = false
    const timer = setTimeout(() => {
      if (settled) return
      settled = true
      worker.terminate()
      resolve(null)
    }, timeoutMs)
    worker.once('message', (elapsedMs: number) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      worker.terminate()
      resolve(elapsedMs)
    })
    worker.once('error', () => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      resolve(null)
    })
  })
}

describe('CSS_VALUE_TOKEN stays linear', () => {
  // CSS_VALUE_TOKEN's numeric branch used to be a bare `\d+(?:\.\d+)?[a-z%]*`, sitting inside an
  // alternation that is itself repeated with `*`. A run of N digits can be split across that
  // alternation in 2^(N-1) ways (any prefix can be consumed by one iteration, the remainder by
  // the next), and when the tail beyond the digit run then fails to reach the trailing `$`
  // anchor, the engine backtracks through every one of those partitions before giving up —
  // classic catastrophic backtracking, ambiguous alternation over `\d+` under a `*`. A committed
  // line carrying a long enough run of digits followed by ordinary prose (35+ digits was enough
  // to hang for minutes) froze `pnpm run ci:check` rather than reporting the reference. The fix
  // makes the numeric token MAXIMAL with a trailing `(?![\d.])`: a partition that stops short of
  // the run's true end is now refused outright, so there is exactly one way to consume a digit
  // run and nothing is left to branch on. This row is RED before that lookahead exists and GREEN
  // after; if a future edit reintroduces the ambiguity (for instance by widening the numeric
  // branch again without re-adding the lookahead), this test times out and reds rather than the
  // next hung CI job doing the catching.
  it('a long digit run must not catastrophically backtrack', async () => {
    const TIMEOUT_MS = 3000
    const pathological = `color: ${'1'.repeat(40)} see `
    const elapsedMs = await measureColourDeclarationOnWorker(pathological, TIMEOUT_MS)
    expect(
      elapsedMs,
      `COLOUR_DECLARATION.test() on a 40-digit run did not finish within ${TIMEOUT_MS}ms; the ` +
        'numeric branch of CSS_VALUE_TOKEN has regained ambiguous alternation over `\\d+` ' +
        'under a `*` and is catastrophically backtracking again',
    ).not.toBeNull()
    expect(
      elapsedMs,
      `COLOUR_DECLARATION.test() took ${elapsedMs}ms on a 40-digit run; expected well under a ` +
        'millisecond for a linear-time match',
    ).toBeLessThan(50)
  }, 10_000)
})
