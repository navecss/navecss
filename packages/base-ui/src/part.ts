'use client'

/**
 * The one helper every wrapped part is built with. A wrapped part is Base UI's part with Nave's
 * class added to its `className` (a string is joined after Nave's class, a function of state is
 * wrapped, never stringified) and, for the Button family, the typed `variant` and `size` props
 * turned into `data-nave-*` attributes. Everything else (every other prop, the ref, `render`) goes
 * to Base UI's part untouched, and nothing here reads state, layout or style: what the wrapper adds
 * is chosen by the props the consumer passed.
 */
import {
  createElement,
  type ElementType,
  forwardRef,
  type ForwardRefExoticComponent,
  type RefAttributes,
  useMemo,
} from 'react'

export interface VariantProps {
  size?: 'md' | 'sm'
  variant?: 'primary' | 'secondary'
}

export interface SizeProps {
  size?: 'md' | 'sm'
}

type ClassNameFunction = (state: unknown) => string | undefined
type ClassName = ClassNameFunction | string | undefined
type Props = Record<string, unknown>

const join = (own: string, consumer: string | undefined): string =>
  consumer === undefined || consumer === '' ? own : `${own} ${consumer}`

/**
 * Nave's class composed with the consumer's. The result is memoized on the consumer's own value,
 * so a consumer that passes the same function gets the same function through and a memoized part
 * does not re-render for it.
 */
const useClassName = (own: string, consumer: ClassName): ClassName =>
  useMemo(
    () =>
      typeof consumer === 'function'
        ? (state: unknown) => join(own, consumer(state))
        : join(own, consumer),
    [own, consumer],
  )

/**
 * The attributes a non-default variant or size renders as, and the props left over. `variant` and
 * `size` are consumed here and never reach Base UI's part, which has no such props.
 */
const variantAttributes = (props: Props, variants: 'size' | 'variant'): Props => {
  const { size, variant, ...rest } = props
  return {
    ...rest,
    ...(variants === 'variant' && variant === 'primary' && { 'data-nave-variant': 'primary' }),
    ...(size === 'sm' && { 'data-nave-size': 'sm' }),
  }
}

const build = (
  part: ElementType,
  own: string,
  variants: 'size' | 'variant' | undefined,
): ForwardRefExoticComponent<Props & RefAttributes<unknown>> =>
  forwardRef<unknown, Props>(function NaveBaseUiPart(props, ref) {
    const forwarded = variants === undefined ? props : variantAttributes(props, variants)
    const className = useClassName(own, forwarded.className as ClassName)
    return createElement(part, { ...forwarded, className, ref })
  })

/**
 * The wrapped part, or nothing where the installed Base UI has no such part (one younger than the
 * peer floor): the export stays absent instead of becoming a component that throws when rendered.
 */
const wrap = <T>(part: unknown, className: string, variants: 'size' | 'variant' | undefined): T =>
  part === undefined
    ? (part as T)
    : (build(part as ElementType, className, variants) as unknown as T)

/**
 * A part that is Base UI's own, with `className` composed. Typed as the part it wraps. A part the
 * installed Base UI does not have stays absent.
 */
export const wrapPart = <P>(part: P, className: string): P => wrap<P>(part, className, undefined)

/**
 * A part of the Button family: as `wrapPart`, and its props gain `variant` and `size`. The type it
 * is given is the type the generated module declares for it, written from Base UI's own public
 * `Props` so that a generic part (a trigger's `Payload`) stays generic.
 */
export const wrapVariantPart = <T>(part: unknown, className: string): T =>
  wrap<T>(part, className, 'variant')

/**
 * A part that gains `size` alone, as the Toggle does. A part the installed Base UI does not have
 * stays absent, as for `wrapPart`.
 */
export const wrapSizePart = <T>(part: unknown, className: string): T =>
  wrap<T>(part, className, 'size')
