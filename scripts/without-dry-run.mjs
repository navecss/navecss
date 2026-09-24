#!/usr/bin/env node
/**
 * Runs a command with `npm_config_dry_run` cleared from its environment.
 *
 * `pnpm publish --dry-run` exports `npm_config_dry_run=true` into the environment of every
 * script it runs. `prepublishOnly` inherits it, and `attw --pack` shells out to a nested
 * `pnpm pack` that also honours the inherited flag and writes no tarball — so `attw` then
 * opens a filename that was never created (`ENOENT`, exit 3). `check:pack` has no dry-run
 * mode of its own: it always packs and reads a real tarball, so clearing the flag is correct
 * for every caller, including a legitimate `pnpm publish --dry-run`.
 *
 * This is a Node wrapper rather than the POSIX `env -u` it replaces, for two reasons. `env`
 * does not exist under `cmd.exe`, pnpm's default script shell on Windows, so `env -u` made
 * `check:pack` silently POSIX-only. And `env -u npm_config_dry_run` clears exactly one
 * spelling, while environment variable names are case-insensitive on Windows; deleting every
 * key whose lowercased name matches covers the variants that can collide there.
 */
import { spawn } from 'node:child_process'

const [command, ...args] = process.argv.slice(2)

if (command === undefined) {
  console.error('usage: node scripts/without-dry-run.mjs <command> [args...]')
  process.exitCode = 2
} else {
  const env = { ...process.env }
  for (const key of Object.keys(env)) {
    if (key.toLowerCase() === 'npm_config_dry_run') delete env[key]
  }

  // `shell: true` is required on Windows so the `.CMD` shims pnpm writes into `node_modules/.bin`
  // resolve through PATHEXT; on POSIX the command is executed directly, with no shell to quote for.
  const child = spawn(command, args, {
    stdio: 'inherit',
    env,
    shell: process.platform === 'win32',
  })

  child.on('error', (error) => {
    console.error(`without-dry-run: could not run ${command}: ${error.message}`)
    process.exitCode = 127
  })

  child.on('exit', (code, signal) => {
    if (signal !== null) {
      process.kill(process.pid, signal)
      return
    }
    process.exitCode = code ?? 1
  })
}
