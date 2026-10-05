import { readFileSync } from 'node:fs'
import path from 'node:path'
import * as React from 'react'
import { describe, expect, it } from 'vitest'

import { PACKAGE_DIR } from '../support/stylesheet.ts'

const FLOOR_VERSION = '1.3.0'

describe('the run matrix', () => {
  it('loads the React major the run names', () => {
    // eslint-disable-next-line turbo/no-undeclared-env-vars -- a test-run variable set by vitest.config.ts, not a build input
    expect(React.version.split('.', 1)[0]).toBe(process.env.NAVE_REACT)
  })

  it('loads the Base UI the run names', async () => {
    const { default: manifest } = (await import('@base-ui/react/package.json', {
      with: { type: 'json' },
    })) as unknown as { default: { version: string } }
    const { version } = manifest
    const devDependency = (
      JSON.parse(readFileSync(path.join(PACKAGE_DIR, 'package.json'), 'utf8')) as {
        devDependencies: Record<string, string>
      }
    ).devDependencies['@base-ui/react']
    expect(version).toBe(
      // eslint-disable-next-line turbo/no-undeclared-env-vars -- a test-run variable set by vitest.config.ts, not a build input
      process.env.NAVE_BASE_UI === 'floor' ? FLOOR_VERSION : devDependency?.replace(/^\^/, ''),
    )
  })

  it('declares the floor as the peer range and as the alias the floor runs install', () => {
    const manifest = JSON.parse(readFileSync(path.join(PACKAGE_DIR, 'package.json'), 'utf8')) as {
      devDependencies: Record<string, string>
      peerDependencies: Record<string, string>
    }
    expect(manifest.peerDependencies['@base-ui/react']).toBe(`^${FLOOR_VERSION}`)
    expect(manifest.devDependencies['base-ui-react-floor']).toBe(
      `npm:@base-ui/react@${FLOOR_VERSION}`,
    )
  })
})
