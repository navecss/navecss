/**
 * AC-native-apply-order-21, -22 and -24 on the Lightning CSS adapter: the order warning is
 * printed with `console.warn` framed `file:line:column: `, always, whatever `onUnknown` says, and
 * before any throw under `'error'`. It never fails a build, and the text a throw carries holds
 * none of it.
 */
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { expandText } from '../src/directive/expand-text.ts'
import { navePlugin } from '../src/lightningcss.ts'
import { LIGHTNING_RELEASES } from './helpers/lightningcss-releases.ts'

type Mode = 'error' | 'ignore' | 'warn'
const MODES: readonly Mode[] = ['warn', 'error', 'ignore']

const FIXTURE = '.c { @nave hideDesktopUp flex; }'
const WITH_PROBLEM = '.c { @nave hideDesktopUp flex; } .d { @nave nope; }'
const OWN = { mine: { declarations: { 'accent-color': 'red' } } }

const scratch = { dir: '' }

beforeEach(() => {
  scratch.dir = mkdtempSync(path.join(tmpdir(), 'nave-lightning-order-'))
})

afterEach(() => {
  vi.restoreAllMocks()
  rmSync(scratch.dir, { force: true, recursive: true })
})

/**
 * Writes `text` as `a.css` in the scratch directory and returns its path.
 */
function write(text: string): string {
  const file = path.join(scratch.dir, 'a.css')
  writeFileSync(file, text, 'utf8')
  return file
}

/**
 * The framed line the adapter prints for the fixture's warning in `file`.
 */
function framed(file: string): string {
  return `${file}:1:26: ${expandText(FIXTURE).warnings[0]!.text}`
}

/**
 * Spies on `console.warn` without printing.
 */
function spyOnWarn(): ReturnType<typeof vi.spyOn> {
  return vi.spyOn(console, 'warn').mockImplementation(() => {})
}

describe('AC-native-apply-order-21 — the Lightning CSS adapter', () => {
  it.each(MODES)(
    'expand(), onUnknown %s: returns, and prints the warning once framed',
    (onUnknown) => {
      const warn = spyOnWarn()

      const result = navePlugin({ onUnknown }).expand(FIXTURE, 'a.css')

      expect(new TextDecoder().decode(result.code)).toContain('& { display: flex }')
      expect(warn.mock.calls).toEqual([[framed('a.css')]])
    },
  )

  it.each(MODES)('the output is the marked output, onUnknown %s', (onUnknown) => {
    spyOnWarn()
    const nave = navePlugin({ onUnknown })
    const marked = '.c { @nave /* nave-allow-override: display */ hideDesktopUp flex; }'

    const plain = nave.expand(FIXTURE, 'a.css')
    const control = nave.expand(marked, 'a.css')

    expect(new TextDecoder().decode(plain.code)).toBe(new TextDecoder().decode(control.code))
  })

  it('a marked directive prints nothing', () => {
    const warn = spyOnWarn()

    navePlugin().expand(
      '.c { @nave /* nave-allow-override: display */ hideDesktopUp flex; }',
      'a.css',
    )

    expect(warn).not.toHaveBeenCalled()
  })

  it.each(MODES)(
    'resolver.read(), onUnknown %s: returns, and prints the warning once framed',
    (onUnknown) => {
      const warn = spyOnWarn()
      const file = write(FIXTURE)

      const text = navePlugin({ onUnknown }).resolver.read(file)

      expect(text).toContain('& { display: flex }')
      expect(warn.mock.calls).toEqual([[framed(file)]])
    },
  )

  describe.each(LIGHTNING_RELEASES)('bundleAsync() on $label', (release) => {
    it.each(MODES)(
      'onUnknown %s: returns, the warning printed once through the resolver',
      async (onUnknown) => {
        const warn = spyOnWarn()
        const file = write(FIXTURE)

        const result = await release.lib.bundleAsync({
          filename: file,
          resolver: navePlugin({ onUnknown }).resolver,
        })

        expect(result.code.toString()).not.toContain('@nave')
        expect(warn.mock.calls).toEqual([[framed(file)]])
      },
    )
  })
})

describe('AC-native-apply-order-22 — the Lightning CSS adapter never folds it with a problem', () => {
  it('under error, console.warn gets the order warning before the throw, whose text holds none of it', () => {
    const order: string[] = []
    vi.spyOn(console, 'warn').mockImplementation((text: unknown) => {
      order.push(`warned ${String(text).includes('so under @media')}`)
    })
    let thrown = ''
    try {
      navePlugin({ onUnknown: 'error' }).expand(WITH_PROBLEM, 'a.css')
    } catch (error) {
      order.push('threw')
      thrown = (error as Error).message
    }

    expect(order).toEqual(['warned true', 'threw'])
    expect(thrown).toContain('nope')
    expect(thrown).not.toContain('so under @media')
    expect(thrown).not.toContain('nave-allow-override')
  })

  it('under error, the resolver prints the order warning before it throws too', async () => {
    const warn = spyOnWarn()
    const file = write(WITH_PROBLEM)
    const release = LIGHTNING_RELEASES.at(-1)!

    await expect(
      release.lib.bundleAsync({ filename: file, resolver: navePlugin().resolver }),
    ).rejects.toThrow(/nope/)

    expect(warn.mock.calls.map(([text]) => String(text))).toEqual([framed(file)])
  })

  it('under warn, the problem and the order warning are two separate prints', () => {
    const warn = spyOnWarn()

    navePlugin({ onUnknown: 'warn' }).expand(WITH_PROBLEM, 'a.css')

    const texts = warn.mock.calls.map(([text]) => String(text))
    expect(texts).toHaveLength(2)
    expect(texts.filter((text) => text.includes('nope'))).toHaveLength(1)
    expect(texts.find((text) => text.includes('nope'))).not.toContain('so under @media')
  })

  it('under ignore, the problem is silent and the order warning is printed', () => {
    const warn = spyOnWarn()

    navePlugin({ onUnknown: 'ignore' }).expand(WITH_PROBLEM, 'a.css')

    expect(warn.mock.calls).toEqual([[framed('a.css')]])
  })
})

describe('AC-native-apply-order-24 — the fixture prints under every onUnknown, with extend', () => {
  it.each(MODES)('onUnknown %s with an extend atom prints the warning', (onUnknown) => {
    const warn = spyOnWarn()

    navePlugin({ onUnknown, extend: OWN }).expand(FIXTURE, 'a.css')

    expect(warn.mock.calls).toEqual([[framed('a.css')]])
  })
})
