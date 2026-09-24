#!/usr/bin/env node
/**
 * Nave CLI — @navecss/cli
 * Component registry client. The commands are stubs until the registry exists;
 * the package stays unpublished (ignored in .changeset/config.json) until then.
 */

const [command, ...args] = process.argv.slice(2)

const NOT_YET = 'not implemented yet — the component registry does not exist'

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
    add [component] Add a component from the registry
    eject           Export full token config for manual editing

  Run \`navecss [command] --help\` for details.
    `.trim(),
    )
  }
}
