/**
 * The four runs every render test makes (R13 (iii)): the Base UI floor (`@base-ui/react@1.0.0`,
 * installed as `base-ui-react-floor`) and the current devDependency, each on React 18 and on
 * React 19. A run is a vitest project; the project name is the run's name.
 */
import { fileURLToPath } from 'node:url'

export type BaseUiRun = 'current' | 'floor'
export type ReactMajor = '18' | '19'

export interface Run {
  readonly baseUi: BaseUiRun
  readonly name: string
  readonly react: ReactMajor
}

export const runs: readonly Run[] = (['floor', 'current'] as const).flatMap((baseUi) =>
  (['18', '19'] as const).map((react) => ({ baseUi, name: `${baseUi}-react-${react}`, react })),
)

export const REACT_18_HOOKS = fileURLToPath(new URL('react-18-hooks.mjs', import.meta.url))

/**
Where the code Vite transforms (the wrappers and the tests) finds React 18 and the floor. Code
Node loads itself (Base UI, React) follows the resolve hook instead.
 */
export const aliasesFor = (run: Run): { find: RegExp; replacement: string }[] => [
  ...(run.react === '18'
    ? [
        { find: /^react$/, replacement: 'react-18' },
        { find: /^react\/(.*)$/, replacement: 'react-18/$1' },
        { find: /^react-dom$/, replacement: 'react-dom-18' },
        { find: /^react-dom\/(.*)$/, replacement: 'react-dom-18/$1' },
      ]
    : []),
  ...(run.baseUi === 'floor'
    ? [{ find: /^@base-ui\/react(\/.*)?$/, replacement: 'base-ui-react-floor$1' }]
    : []),
]
