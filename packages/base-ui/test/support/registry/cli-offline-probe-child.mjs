/**
 * Run as a child by `cli-offline-probe.ts`, with and without the offline preload. It reaches a
 * server three ways (the global `fetch`, `http.get`, a bare socket) at `0.0.0.0` and once by
 * `fetch` at `127.0.0.1`, and prints, as JSON, whether each got an answer. `0.0.0.0` on the port of
 * a server listening on 127.0.0.1 is reachable on the machine and is not a loopback address by
 * name, so a refusal there can only come from the preload.
 */
import http from 'node:http'
import net from 'node:net'

const port = Number(process.argv[2])

const outcome = async (attempt) => {
  try {
    await attempt()
    return 'answered'
  } catch {
    return 'refused'
  }
}

const viaHttp = (url) =>
  new Promise((resolve, reject) => {
    http
      .get(url, (response) => {
        response.resume()
        response.on('end', resolve)
      })
      .on('error', reject)
  })

const viaSocket = (host) =>
  new Promise((resolve, reject) => {
    const socket = net.connect(port, host, () => {
      socket.destroy()
      resolve()
    })
    socket.on('error', reject)
  })

const result = {
  fetchLoopback: await outcome(() => fetch(`http://127.0.0.1:${port}/`)),
  fetchReachable: await outcome(() => fetch(`http://0.0.0.0:${port}/`)),
  httpReachable: await outcome(() => viaHttp(`http://0.0.0.0:${port}/`)),
  socketReachable: await outcome(() => viaSocket('0.0.0.0')),
}
process.stdout.write(JSON.stringify(result))
