/**
 * The install of Next.js 16.2.0 that the real-build rows share: several test files ask for it at
 * once on a fresh machine, and none may run `next` on a tree npm is still writing. The `npm` here
 * is a script that writes `next` first, waits, then writes `react`, as the real one extracts them
 * one after another.
 */
import { spawn } from 'node:child_process'
import {
  chmodSync,
  existsSync,
  mkdtempSync,
  readdirSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { FLOOR_VERSION, floorNextRootIn } from './helpers/next-floor.ts'

let scratch = ''
let npm = ''
let floorDir = ''

const reactIsThere = (): boolean =>
  existsSync(path.join(floorDir, 'node_modules/react/package.json'))

beforeEach(() => {
  scratch = realpathSync(mkdtempSync(path.join(tmpdir(), 'prune-floor-')))
  floorDir = path.join(scratch, 'floor')
  npm = path.join(scratch, 'npm')
  writeFileSync(
    npm,
    [
      '#!/bin/sh',
      'mkdir -p node_modules/next node_modules/react',
      `printf '{"version":"${FLOOR_VERSION}"}' > node_modules/next/package.json`,
      'sleep 2',
      `printf '{"version":"19.2.0"}' > node_modules/react/package.json`,
      '',
    ].join('\n'),
  )
  chmodSync(npm, 0o755)
})

afterEach(() => rmSync(scratch, { recursive: true, force: true }))

describe('the Next.js floor install', () => {
  it('hands the directory to no caller before react is installed beside next', async () => {
    const seen = await Promise.all(
      [1, 2, 3].map(async () => {
        await floorNextRootIn(floorDir, npm)
        return reactIsThere()
      }),
    )

    expect(seen).toEqual([true, true, true])
  })

  it('leaves no directory behind but the install itself', async () => {
    await floorNextRootIn(floorDir, npm)

    expect(readdirSync(scratch).toSorted((a, b) => a.localeCompare(b))).toEqual(['floor', 'npm'])
  })

  it('shows no installed floor while npm is still running', async () => {
    const installing = floorNextRootIn(floorDir, npm)
    try {
      // npm has written `next` by now and is waiting before it writes `react`.
      await new Promise((resolve) => setTimeout(resolve, 1000))

      expect(existsSync(path.join(floorDir, 'node_modules/next/package.json'))).toBe(false)
    } finally {
      await installing
    }
    expect(reactIsThere()).toBe(true)
  })

  it('leaves nothing installed when npm fails, and installs on the next ask', async () => {
    const failing = path.join(scratch, 'failing')
    writeFileSync(
      failing,
      `#!/bin/sh\nmkdir -p node_modules/next\nprintf '{"version":"${FLOOR_VERSION}"}' > node_modules/next/package.json\nexit 1\n`,
    )
    chmodSync(failing, 0o755)

    await expect(floorNextRootIn(floorDir, failing)).rejects.toThrow('exited 1')
    expect(existsSync(floorDir)).toBe(false)
    await floorNextRootIn(floorDir, npm)
    expect(reactIsThere()).toBe(true)
  })

  it('installs afresh after an installer was killed in the middle of it', async () => {
    const slow = path.join(scratch, 'slow')
    const started = path.join(scratch, 'started')
    writeFileSync(
      slow,
      `#!/bin/sh\nmkdir -p node_modules/next\nprintf '{"version":"${FLOOR_VERSION}"}' > node_modules/next/package.json\ntouch ${started}\nsleep 60\n`,
    )
    chmodSync(slow, 0o755)
    const script = path.join(scratch, 'install.mjs')
    writeFileSync(
      script,
      `import { floorNextRootIn } from ${JSON.stringify(pathToFileURL(path.join(import.meta.dirname, 'helpers/next-floor.ts')).href)}\nawait floorNextRootIn(process.argv[2], process.argv[3])\n`,
    )
    // Its own process group, so the kill takes the installer and the npm it started together.
    const installer = spawn(process.execPath, [script, floorDir, slow], {
      detached: true,
      stdio: 'ignore',
    })
    const exited = new Promise((resolve) => installer.once('exit', resolve))
    for (let tries = 0; !existsSync(started) && tries < 200; tries += 1) {
      await new Promise((resolve) => setTimeout(resolve, 50))
    }
    expect(existsSync(started), 'the installer reached npm').toBe(true)
    process.kill(-installer.pid!, 'SIGKILL')
    await exited

    await floorNextRootIn(floorDir, npm)

    expect(reactIsThere()).toBe(true)
  }, 30_000)
})
