/**
 * Values read the way the page computes them: a motion token's duration and an easing the way a
 * transition would resolve it.
 */

/**
The computed value of a duration token on the root, in milliseconds.
 */
export const tokenMilliseconds = (name: string): number => {
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim()
  if (value.endsWith('ms')) {
    return Number(value.slice(0, -2))
  }
  if (value.endsWith('s')) {
    return Number(value.slice(0, -1)) * 1000
  }
  throw new Error(`${name} computes to "${value}", not a time`)
}

/**
 * An easing token as a transition resolves it: the serialisation `getTiming().easing` and
 * `transition-timing-function` give, which the token's own text need not match.
 */
export const tokenEasing = (name: string): string => {
  const probe = document.createElement('div')
  probe.style.transitionTimingFunction = `var(${name})`
  document.body.append(probe)
  const easing = getComputedStyle(probe).transitionTimingFunction
  probe.remove()
  return easing
}
