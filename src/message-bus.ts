import { EventHandler, on } from '@create-figma-plugin/utilities'

/**
 * Waits for whichever of two message types (typically a "done" and an
 * "error" for the same request) fires first with a payload matching its
 * predicate — used to correlate the sandbox's fan-out `on()` bus to one
 * specific in-flight request when batching (PLAN.md §05 Phase 04). Both
 * listeners are torn down together as soon as either one settles, so an
 * N-item batch never accumulates stale handlers.
 */
export function waitForEither<A extends EventHandler, B extends EventHandler>(
  nameA: A['name'],
  predicateA: (payload: Parameters<A['handler']>[0]) => boolean,
  nameB: B['name'],
  predicateB: (payload: Parameters<B['handler']>[0]) => boolean
): Promise<{ which: 'a'; payload: Parameters<A['handler']>[0] } | { which: 'b'; payload: Parameters<B['handler']>[0] }> {
  return new Promise(function (resolve) {
    let settled = false
    const unregisterA = on<A>(nameA, function (payload: Parameters<A['handler']>[0]) {
      if (settled || !predicateA(payload)) return
      settled = true
      unregisterA()
      unregisterB()
      resolve({ which: 'a', payload })
    })
    const unregisterB = on<B>(nameB, function (payload: Parameters<B['handler']>[0]) {
      if (settled || !predicateB(payload)) return
      settled = true
      unregisterA()
      unregisterB()
      resolve({ which: 'b', payload })
    })
  })
}
