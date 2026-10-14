/**
 * A recorder of what Base UI adds to and takes out of the document while a test acts: the
 * attribute additions (an attribute that was absent and is present), the node insertions with the
 * attributes each part carried when the record was read, and the node removals, each with where
 * the keyboard focus was when the record was read.
 */
export interface Mutation {
  /**
  The document's active element when the record is read.
   */
  readonly activeElement: Element | null
  /**
  Whether the active element is inside the target when the record is read.
   */
  readonly isActiveInsideTarget: boolean
  /**
  For an insertion: each `data-part` marker inserted, with the attribute names it carried when
  the record was read.
   */
  readonly insertedParts: ReadonlyMap<string, readonly string[]>
  readonly kind: 'attribute-added' | 'inserted' | 'removed'
  /**
  The attribute added.
   */
  readonly name: string
  readonly target: Element
}

export interface Recorder {
  readonly records: readonly Mutation[]
  readonly stop: () => void
}

const markedParts = (node: Element): Map<string, readonly string[]> => {
  const parts = new Map<string, readonly string[]>()
  const candidates: Element[] = [node, ...node.querySelectorAll('[data-part]')]
  for (const candidate of candidates) {
    const marker = candidate.getAttribute('data-part')
    if (marker !== null) {
      parts.set(marker, candidate.getAttributeNames())
    }
  }
  return parts
}

const entry = (kind: Mutation['kind'], target: Element, extra: Partial<Mutation> = {}): Mutation => ({
  activeElement: document.activeElement,
  insertedParts: new Map(),
  isActiveInsideTarget: false,
  kind,
  name: '',
  target,
  ...extra,
})

const recordsOf = (record: MutationRecord): Mutation[] => {
  const target = record.target as Element
  if (record.type === 'attributes') {
    const name = record.attributeName ?? ''
    return record.oldValue === null && target.hasAttribute(name)
      ? [entry('attribute-added', target, { isActiveInsideTarget: target.contains(document.activeElement), name })]
      : []
  }
  return [
    ...[...record.addedNodes]
      .filter((node) => node instanceof Element)
      .map((node) => entry('inserted', node, { insertedParts: markedParts(node) })),
    ...[...record.removedNodes].filter((node) => node instanceof Element).map((node) => entry('removed', node)),
  ]
}

/**
Records on the document body and below until stopped.
 */
export const recordMutations = (): Recorder => {
  const records: Mutation[] = []
  const observer = new MutationObserver((batch) => {
    records.push(...batch.flatMap((record) => recordsOf(record)))
  })
  observer.observe(document.body, {
    attributeOldValue: true,
    attributes: true,
    childList: true,
    subtree: true,
  })
  return {
    records,
    stop: () => {
      observer.disconnect()
    },
  }
}

/**
The attribute additions of one name.
 */
export const additionsOf = (recorder: Recorder, name: string): Mutation[] =>
  recorder.records.filter((record) => record.kind === 'attribute-added' && record.name === name)
