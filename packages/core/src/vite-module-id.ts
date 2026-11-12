/**
 * Which module is a dependency's, from its id alone.
 */
import { filePathOf } from './vite-css-id.ts'

/**
 * Whether the module's resolved path lies under `node_modules`.
 */
export function isDependencyId(id: string): boolean {
  return filePathOf(id).replaceAll('\\', '/').includes('/node_modules/')
}
