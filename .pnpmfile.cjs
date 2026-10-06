'use strict'

/**
 * `@navecss/base-ui` tests its wrappers against React 18 and React 19 in one workspace, so both
 * are installed (as the `react-18` / `react-dom-18` aliases). pnpm resolves a peer by package
 * name from the importing package, which would bind react-dom 18 to the React 19 copy; this hook
 * gives react-dom 18 its own React 18 as a plain dependency instead.
 */
module.exports = {
  hooks: {
    readPackage(pkg) {
      if (pkg.name === 'react-dom' && pkg.version.startsWith('18.')) {
        const { react: _react, ...peers } = pkg.peerDependencies ?? {}
        pkg.peerDependencies = peers
        pkg.dependencies = { ...pkg.dependencies, react: `npm:react@${pkg.version}` }
      }
      return pkg
    },
  },
}
