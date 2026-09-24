/**
 * Unit coverage for the pure logic in check-adr-structure.mjs, run with Node's built-in
 * test runner, matching the sibling checks' "no dependency, no counterparty" shape. Synthetic
 * fixtures only, never the tracked docs/04-adr/ tree.
 */
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { test } from 'node:test'

import {
  adrId,
  checkStatusRules,
  checkUniqueIds,
  extractStatus,
  formatSummary,
  loadAdrs,
  parseFrontmatter,
  parseListValue,
  runCheck,
} from './check-adr-structure.mjs'

test('formatSummary: the printed summary names all three structural rules, not just links', () => {
  assert.equal(
    formatSummary(3),
    'ADR structural check: 3 ADR(s); ids unique, supersession links reciprocal, deprecations documented.',
  )
  assert.doesNotMatch(formatSummary(3), /all links resolve and reciprocate/)
  assert.doesNotThrow(() => formatSummary(0))
})

test('parseFrontmatter reads a leading --- block and strips it from the body', () => {
  const text = '---\nsupersedes: "-"\nsuperseded-by: "-"\n---\n\n# Title\n\nbody text\n'
  const { fields, body } = parseFrontmatter(text)
  assert.deepEqual(fields, { supersedes: '"-"', 'superseded-by': '"-"' })
  assert.equal(body, '\n# Title\n\nbody text\n')
})

test('parseFrontmatter returns empty fields and the whole text when there is no block', () => {
  const text = '# Title\n\nbody text\n'
  const { fields, body } = parseFrontmatter(text)
  assert.deepEqual(fields, {})
  assert.equal(body, text)
})

test('parseListValue treats "-" as empty, bare, double-quoted, and single-quoted', () => {
  assert.deepEqual(parseListValue('-'), [])
  assert.deepEqual(parseListValue('"-"'), [])
  // prettier rewrites double to single quotes in this repo's style; the
  // frontmatter written by hand may use either, and both must mean "nothing".
  assert.deepEqual(parseListValue("'-'"), [])
  assert.deepEqual(parseListValue(''), [])
  assert.deepEqual(parseListValue(undefined), [])
})

test('parseListValue reads a bracketed, quoted list', () => {
  assert.deepEqual(parseListValue('["a", "b"]'), ['a', 'b'])
})

test('parseListValue reads a single bare or quoted value as a one-element list', () => {
  assert.deepEqual(parseListValue('0001-first'), ['0001-first'])
  assert.deepEqual(parseListValue('"0001-first"'), ['0001-first'])
})

test('adrId extracts the numeric prefix, null for a non-numbered file', () => {
  assert.equal(adrId('0001-native-css-nesting.md'), '0001')
  assert.equal(adrId('index.md'), null)
})

test('extractStatus reads the Status bullet, value lowercased', () => {
  assert.equal(extractStatus('- **Status:** accepted\n- **Date:** 2026-08-10\n'), 'accepted')
  assert.equal(extractStatus('no status bullet here'), null)
})

function fixtureAdr({ id, status = 'accepted', fields = {}, extraBody = '' }) {
  const filename = `${id}-fixture.md`
  const body = `\n# ${id} - fixture\n\n- **Status:** ${status}\n${extraBody}`
  return { filename, id, fields, body, status }
}

test('checkUniqueIds is clean for distinct ids', () => {
  const adrs = [fixtureAdr({ id: '0001' }), fixtureAdr({ id: '0002' })]
  assert.deepEqual(checkUniqueIds(adrs), [])
})

test('checkUniqueIds flags a duplicate id', () => {
  const a = fixtureAdr({ id: '0001' })
  const b = { ...fixtureAdr({ id: '0001' }), filename: '0001-other.md' }
  const problems = checkUniqueIds([a, b])
  assert.equal(problems.length, 1)
  assert.match(problems[0], /0001 is used by both/)
})

test('checkStatusRules passes a plain accepted ADR with no supersession', () => {
  const adr = fixtureAdr({
    id: '0001',
    status: 'accepted',
    fields: { supersedes: '-', 'superseded-by': '-' },
  })
  const byId = new Map([['0001', adr]])
  assert.deepEqual(checkStatusRules([adr], byId), [])
})

test('checkStatusRules flags status:superseded with an empty superseded-by', () => {
  const adr = fixtureAdr({
    id: '0001',
    status: 'superseded',
    fields: { supersedes: '-', 'superseded-by': '-' },
  })
  const byId = new Map([['0001', adr]])
  const problems = checkStatusRules([adr], byId)
  assert.equal(problems.length, 1)
  assert.match(problems[0], /empty superseded-by/)
})

test('checkStatusRules flags a superseded-by that does not resolve to a known ADR', () => {
  const adr = fixtureAdr({
    id: '0001',
    status: 'superseded',
    fields: { supersedes: '-', 'superseded-by': '0002-newer' },
  })
  const byId = new Map([['0001', adr]])
  const problems = checkStatusRules([adr], byId)
  assert.equal(problems.length, 1)
  assert.match(problems[0], /resolves to no ADR file/)
})

test('checkStatusRules flags a one-way superseded-by (target does not name it back)', () => {
  const oldAdr = fixtureAdr({
    id: '0001',
    status: 'superseded',
    fields: { supersedes: '-', 'superseded-by': '0002-newer' },
  })
  const newAdr = fixtureAdr({
    id: '0002',
    status: 'accepted',
    fields: { supersedes: '-', 'superseded-by': '-' },
  })
  const byId = new Map([
    ['0001', oldAdr],
    ['0002', newAdr],
  ])
  const problems = checkStatusRules([oldAdr, newAdr], byId)
  assert.equal(problems.length, 1)
  assert.match(problems[0], /does not name 0001-fixture\.md in its supersedes/)
})

test('checkStatusRules flags a supersedes naming a target that resolves to no ADR file', () => {
  // Isolates the `supersedes` loop's OWN unresolvable-target check (not the mirror
  // check in the `superseded-by` loop above): status is deliberately NOT
  // 'superseded', so that other loop never runs for this ADR at all.
  const adr = fixtureAdr({
    id: '0001',
    status: 'accepted',
    fields: { supersedes: '0002-missing', 'superseded-by': '-' },
  })
  const byId = new Map([['0001', adr]])
  const problems = checkStatusRules([adr], byId)
  assert.equal(problems.length, 1)
  assert.match(problems[0], /resolves to no ADR file/)
})

test('checkStatusRules flags a one-way supersedes (target does not name it back in superseded-by)', () => {
  // Isolates the `supersedes` loop's own back-link check at :176-181, distinct from
  // the mirror `superseded-by` loop's back-link check exercised above. B is given
  // status:superseded (so the "target isn't superseded" rule doesn't also fire) with
  // an empty superseded-by (so it does NOT name A back). That empty field also trips
  // B's own separate "empty superseded-by" rule as a side effect - expected, per the
  // task note - so this asserts on the specific message, not problems.length.
  const a = fixtureAdr({
    id: '0001',
    status: 'accepted',
    fields: { supersedes: '0002-fixture', 'superseded-by': '-' },
  })
  const b = fixtureAdr({
    id: '0002',
    status: 'superseded',
    fields: { supersedes: '-', 'superseded-by': '-' },
  })
  const byId = new Map([
    ['0001', a],
    ['0002', b],
  ])
  const problems = checkStatusRules([a, b], byId)
  assert.ok(
    problems.some((p) =>
      /does not name 0001-fixture\.md in its superseded-by \(one-way link\)/.test(p),
    ),
  )
})

test('checkStatusRules passes a fully reciprocated supersession pair', () => {
  const oldAdr = fixtureAdr({
    id: '0001',
    status: 'superseded',
    fields: { supersedes: '-', 'superseded-by': '0002-newer' },
  })
  const newAdr = fixtureAdr({
    id: '0002',
    status: 'accepted',
    fields: { supersedes: '0001-fixture', 'superseded-by': '-' },
  })
  const byId = new Map([
    ['0001', oldAdr],
    ['0002', newAdr],
  ])
  assert.deepEqual(checkStatusRules([oldAdr, newAdr], byId), [])
})

test('checkStatusRules flags supersedes naming a target that does not itself read status:superseded', () => {
  const newAdr = fixtureAdr({
    id: '0002',
    status: 'accepted',
    fields: { supersedes: '0001-fixture', 'superseded-by': '-' },
  })
  const oldAdr = fixtureAdr({
    id: '0001',
    status: 'accepted',
    fields: { supersedes: '-', 'superseded-by': '0002-newer' },
  })
  const byId = new Map([
    ['0001', oldAdr],
    ['0002', newAdr],
  ])
  const problems = checkStatusRules([oldAdr, newAdr], byId)
  assert.ok(problems.some((p) => /reads status:accepted not 'superseded'/.test(p)))
})

test('checkStatusRules flags status:deprecated with no Deprecation section', () => {
  const adr = fixtureAdr({
    id: '0001',
    status: 'deprecated',
    fields: { supersedes: '-', 'superseded-by': '-' },
  })
  const problems = checkStatusRules([adr], new Map([['0001', adr]]))
  assert.equal(problems.length, 1)
  assert.match(problems[0], /no '## Deprecation' section/)
})

test('checkStatusRules passes status:deprecated when a Deprecation section is present', () => {
  const adr = fixtureAdr({
    id: '0001',
    status: 'deprecated',
    fields: { supersedes: '-', 'superseded-by': '-' },
    extraBody: '\n## Deprecation\n\nNo longer applies because X; do Y instead.\n',
  })
  assert.deepEqual(checkStatusRules([adr], new Map([['0001', adr]])), [])
})

test('checkStatusRules flags an unrecognized status value', () => {
  const adr = fixtureAdr({
    id: '0001',
    status: 'draft',
    fields: { supersedes: '-', 'superseded-by': '-' },
  })
  const problems = checkStatusRules([adr], new Map([['0001', adr]]))
  assert.ok(problems.some((p) => /not in the set/.test(p)))
})

test('checkStatusRules flags a missing Status bullet entirely', () => {
  const adr = {
    filename: '0001-fixture.md',
    id: '0001',
    fields: {},
    body: '# no bullet here',
    status: null,
  }
  const problems = checkStatusRules([adr], new Map([['0001', adr]]))
  assert.ok(problems.some((p) => /no '- \*\*Status:\*\*' bullet/.test(p)))
})

test('loadAdrs reads every numbered file and skips index.md', () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'adr-fixture-'))
  try {
    mkdirSync(dir, { recursive: true })
    writeFileSync(
      path.join(dir, '0001-first.md'),
      '---\nsupersedes: "-"\nsuperseded-by: "-"\n---\n\n# 0001\n\n- **Status:** accepted\n',
    )
    writeFileSync(path.join(dir, 'index.md'), '# Architecture Decision Records\n')
    const adrs = loadAdrs(dir)
    assert.equal(adrs.length, 1)
    assert.equal(adrs[0].id, '0001')
    assert.equal(adrs[0].status, 'accepted')
    assert.equal(adrs[0].fields.supersedes, '"-"')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('runCheck: a clean single-ADR tree passes with the exact composed summary', () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'adr-fixture-'))
  try {
    writeFileSync(
      path.join(dir, '0001-first.md'),
      '---\nsupersedes: "-"\nsuperseded-by: "-"\n---\n\n# 0001\n\n- **Status:** accepted\n',
    )
    const result = runCheck(dir)
    assert.deepEqual(result.problems, [])
    assert.equal(result.summary, formatSummary(1))
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('runCheck: a duplicate ADR id is reported in problems', () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'adr-fixture-'))
  try {
    const body = '---\nsupersedes: "-"\nsuperseded-by: "-"\n---\n\n- **Status:** accepted\n'
    writeFileSync(path.join(dir, '0001-first.md'), `# 0001\n\n${body}`)
    writeFileSync(path.join(dir, '0001-second.md'), `# 0001\n\n${body}`)
    const result = runCheck(dir)
    assert.ok(result.problems.length > 0)
    assert.ok(result.problems.some((p) => /is used by both/.test(p)))
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
