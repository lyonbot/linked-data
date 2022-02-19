type Dict = Record<string | symbol, any>;

const globalLazyGetterCache = new WeakMap<any, Dict>(); // for frozen hosts
const sym = Symbol(`lazyGetterCache`);

const getCache = (o: any): Dict => {
  if (!Object.isExtensible(o)) {
    let ans = globalLazyGetterCache.get(o);
    if (!ans) globalLazyGetterCache.set(o, (ans = {}));
    return ans;
  }

  // TODO: use WeakMap
  let ans = o[sym] as Dict | undefined;
  if (!ans) {
    Object.defineProperty(o, sym, {
      enumerable: false,
      configurable: true,
      value: (ans = {}),
    });
  }

  return ans;
};

function wrapGetter<T, K extends keyof T>(key: K, getter: (this: T) => T[K]) {
  return function (this: any) {
    const cache = getCache(this);
    const called = key in cache;
    const value = called ? cache[key as any] : getter.call(this);
    if (!called) Object.defineProperty(cache, key, { value });

    return value;
  };
}

/**
 * add a lazy property. the getter will be invoked when the property is accessed at first time, then the result will be cached.
 *
 * @public
 * @param obj
 * @param key
 * @param getter
 */
export default function defineLazyGetter<T, K extends keyof T>(obj: T, key: K, getter: (this: T) => T[K]) {
  Object.defineProperty(obj, key, {
    enumerable: true,
    configurable: true,
    get: wrapGetter(key, getter),
  });
}

/**
 * descriptor for TypeScript class
 *
 * @public
 * @example
 *
 * ```js
 * class Foo {
 *   @LazyGetter()
 *   get bar(){ return 24; }
 * }
 * ```
 */
export const LazyGetter = () => (target: any, key: string, desc: PropertyDescriptor) => {
  desc.get = wrapGetter<any, string>(key, desc.get!);
};
