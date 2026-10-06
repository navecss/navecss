/**
 * Preloaded (`--import`) into the React 18 test runs: every `react` and `react-dom` the process
 * loads, from the wrappers, from Base UI, from the libraries Base UI depends on, resolves to the
 * React 18 copies this package installs under the `react-18` and `react-dom-18` aliases.
 * pnpm binds each dependency's `react` peer to the one React it resolved, which here is 19, so
 * without this hook a React 18 run would mix two Reacts and fail at the first hook call. The same
 * mapping reaches `require` as well as `import`.
 */
import { registerHooks } from 'node:module'

const PACKAGE_JSON = new URL('../../package.json', import.meta.url).href
const REACT = /^(react|react-dom)(\/.*)?$/

registerHooks({
  resolve(specifier, context, nextResolve) {
    const match = REACT.exec(specifier)
    if (match === null) {
      return nextResolve(specifier, context)
    }
    const target = `${match[1] === 'react' ? 'react-18' : 'react-dom-18'}${match[2] ?? ''}`
    return nextResolve(target, { ...context, parentURL: PACKAGE_JSON })
  },
})
