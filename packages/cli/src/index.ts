#!/usr/bin/env node
/**
 * Nave CLI — @navecss/cli
 * Not implemented: every command is a stub. @navecss/base-ui's components are copied with
 * shadcn's CLI from the registry that package ships, so nothing here is needed for that.
 * The package stays unpublished (ignored in .changeset/config.json).
 */

const [command, ...args] = process.argv.slice(2)

const NOT_YET =
  "not implemented. @navecss/base-ui's components are copied with shadcn's CLI: see packages/base-ui/README.md#copy-a-component-into-your-project"

switch (command) {
  case 'add': {
    console.log(`[navecss] add: ${args.join(' ')} — ${NOT_YET}`)
    break
  }
  case 'eject': {
    console.log(`[navecss] eject — ${NOT_YET}`)
    break
  }
  case 'init': {
    console.log(`[navecss] init — ${NOT_YET}`)
    break
  }
  default: {
    console.log(
      `
  navecss — Nave Design System CLI

  Commands:
    init            Initialise Nave in your project
    add [component] Not implemented: see packages/base-ui/README.md

  Run \`navecss [command] --help\` for details.
    `.trim(),
    )
  }
}
