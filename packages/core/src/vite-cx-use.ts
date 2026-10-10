/**
 * What a use of the `cx` import is, told apart by what it does with the binding, and what a
 * binding stands for: the shapes `vite-cx-reference.ts` reads a module into.
 */
import type { AstNode } from './vite-ast.ts'
import type { Binding } from './vite-scope.ts'

type UseKind = 'call' | 'dynamic' | 'exposure' | 'raw' | 'refused'

export interface CxUse {
  readonly kind: UseKind
  /**
   * For a call, the call; for a refused use, the construct that refuses (where its error points).
   */
  readonly node: AstNode
  /**
   * The name the module gives the binding (`cx`, or an alias).
   */
  readonly local: string
  /**
   * For a refused use: what it does with the binding, as the report words it.
   */
  readonly phrase?: string
  /**
   * Whether the refused use is a re-export of the binding, which `cxModules` declares away.
   */
  readonly isReexport?: boolean
  /**
   * For a refused re-export: whether listing the module in `cxModules` would clear it, which it
   * does not when the binding comes from a module that is already listed (a second hop).
   */
  readonly isListable?: boolean
  /**
   * For a refused re-export: whether it gives the binding out under a name other than `cx`.
   */
  readonly isRenamed?: boolean
  /**
   * For an exposure: the name a compiled Vue component's setup return gives the binding.
   */
  readonly exposedAs?: string
}

/**
 * What a binding stands for in the module: Nave's `cx` itself, or the namespace holding it.
 */
export interface CxBinding {
  readonly binding: Binding
  readonly isNamespace: boolean
}
