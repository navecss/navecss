import type { NaveOptions } from './options.ts'

export type { NaveOptions } from './options.ts'

/**
 * Wraps a Next.js config. Slice stub: the real wrapper replaces this.
 */
export function withNave<Config extends object>(
  config: Config,
  _options: NaveOptions = {},
): Config {
  return config
}
