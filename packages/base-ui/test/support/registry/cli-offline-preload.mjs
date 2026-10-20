/**
 * Preloaded into a child `node` through `NODE_OPTIONS=--import`. Every connection to an address that
 * is not on the loopback interface fails, whichever client opens it (the global `fetch`, `http`,
 * `https`, `tls`, a socket opened directly), and every name lookup for a non-loopback host fails. Each
 * refused attempt is appended to the file `NAVE_OFFLINE_LOG` names, so a caller can tell a run that
 * never reached for the network from one that reached for it and carried on.
 */
/* eslint-disable unicorn/no-this-outside-of-class, unicorn/no-global-object-property-assignment, unicorn/no-unnecessary-global-this -- patching Node's own connect, lookup and fetch is the purpose of this file, and each patch forwards the caller's `this` */
import dns from 'node:dns'
import { appendFileSync } from 'node:fs'
import net from 'node:net'

const LOOPBACK = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1', '[::1]', 'localhost'])
// eslint-disable-next-line turbo/no-undeclared-env-vars -- a test-run variable this file's caller sets, not a build input
const log = process.env.NAVE_OFFLINE_LOG

const isLoopback = (host) =>
  host === undefined || host === '' || LOOPBACK.has(host) || /^127\./.test(host)

const refusal = (target) => {
  if (log !== undefined) appendFileSync(log, `${target}\n`)
  const error = new Error(`connect ENETUNREACH ${target} (offline)`)
  error.code = 'ENETUNREACH'
  return error
}

// A unix-socket path has no host: it reads as an empty one, which is local.
const LOCAL = { host: '', port: 0 }

const connectTarget = (args) => {
  const first = Array.isArray(args[0]) ? args[0][0] : args[0]
  if (typeof first === 'object' && first !== null) {
    return typeof first.path === 'string' ? LOCAL : { host: first.host, port: first.port }
  }
  if (typeof first === 'string' && Number.isNaN(Number(first))) return LOCAL
  return { host: typeof args[1] === 'string' ? args[1] : '', port: first }
}

const originalConnect = net.Socket.prototype.connect
net.Socket.prototype.connect = function connect(...args) {
  const target = connectTarget(args)
  if (isLoopback(target.host)) return originalConnect.apply(this, args)
  const error = refusal(`${target.host}:${target.port}`)
  queueMicrotask(() => this.destroy(error))
  return this
}

const originalLookup = dns.lookup
dns.lookup = function lookup(hostname, ...rest) {
  if (isLoopback(hostname)) return originalLookup.call(this, hostname, ...rest)
  const callback = rest.at(-1)
  const error = refusal(`${hostname}:lookup`)
  if (typeof callback === 'function') queueMicrotask(() => callback(error))
  return {}
}

const originalPromisesLookup = dns.promises.lookup
dns.promises.lookup = async function lookup(hostname, ...rest) {
  if (isLoopback(hostname)) return originalPromisesLookup.call(this, hostname, ...rest)
  throw refusal(`${hostname}:lookup`)
}

const originalFetch = globalThis.fetch
globalThis.fetch = async function fetch(input, init) {
  const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url)
  if (url.protocol !== 'file:' && url.protocol !== 'data:' && !isLoopback(url.hostname)) {
    throw new TypeError('fetch failed', { cause: refusal(url.host) })
  }
  return originalFetch.call(this, input, init)
}
