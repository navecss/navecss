/**
 * The README that ships in core's tarball ends with the notice that the package is not affiliated
 * with Vercel or the Next.js project and the attribution of the marks, as its last two paragraphs.
 * Core's tarball carries the Next.js pointers, so it carries the notice too. The lines are held
 * byte for byte.
 */
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const README = path.resolve(import.meta.dirname, '../README.md')

const NOT_AFFILIATED =
  'This package is not affiliated with, endorsed by or sponsored by Vercel or the Next.js project.'

const ATTRIBUTION =
  'Vercel, the Vercel design, Next.js and related marks, designs and logos are trademarks or registered trademarks of Vercel, Inc. or its affiliates in the US and other countries.'

const fingerprint = (text: string): { bytes: number; sha256: string } => ({
  bytes: Buffer.byteLength(text),
  sha256: createHash('sha256').update(text).digest('hex').slice(0, 16),
})

/**
 * Whether the text's last two paragraphs are the two lines, in this order, and it ends in one
 * line feed.
 */
const endsWithNotice = (text: string): boolean =>
  text.endsWith(`\n\n${NOT_AFFILIATED}\n\n${ATTRIBUTION}\n`) && !text.endsWith('\n\n\n')

describe('core README: the trademark notice', () => {
  it('has the two lines byte for byte', () => {
    expect(fingerprint(NOT_AFFILIATED)).toEqual({ bytes: 95, sha256: '17a46ea5a2975184' })
    expect(fingerprint(ATTRIBUTION)).toEqual({ bytes: 176, sha256: '3866a99ef62f1845' })
  })

  it('ends with them as its last two paragraphs', () => {
    expect(endsWithNotice(readFileSync(README, 'utf8'))).toBe(true)
  })

  it('control: a README with either line removed fails', () => {
    const readme = readFileSync(README, 'utf8')
    expect(endsWithNotice(readme.replace(`${NOT_AFFILIATED}\n\n`, ''))).toBe(false)
    expect(endsWithNotice(readme.replace(`\n\n${ATTRIBUTION}`, ''))).toBe(false)
  })

  it('control: the two lines in the other order fail', () => {
    const readme = readFileSync(README, 'utf8')
    expect(
      endsWithNotice(
        readme.replace(
          `${NOT_AFFILIATED}\n\n${ATTRIBUTION}`,
          `${ATTRIBUTION}\n\n${NOT_AFFILIATED}`,
        ),
      ),
    ).toBe(false)
  })
})
