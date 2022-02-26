/**
 * create a memoized function, whose result will be cached in a WeakMap.
 *
 * if input is not object, the function will be called immediately without caching.
 *
 * @public
 */
export function memoWithWeakMap<T, U>(fn: (a: T) => U) {
  let map = new WeakMap<T & object, U>();

  const memoizedFunction = function (a: T): U {
    if (typeof a !== 'object' || a === null) return fn(a);

    const objA = a as unknown as T & object;
    if (map.has(objA)) return map.get(objA)!;

    const answer = fn(a);
    map.set(objA, answer);
    return answer;
  };

  memoizedFunction.clear = () => {
    map = new WeakMap();
  };

  memoizedFunction.delete = (a: T) => {
    if (typeof a === 'object' && a !== null) map.delete(a as unknown as object & T);
  };

  // eslint-disable-next-line @typescript-eslint/ban-types
  memoizedFunction.get = (a: T) => map.get(a as unknown as T & {});

  return memoizedFunction;
}
