export { memoWithWeakMap } from './memoWithWeakMap';

/**
 * This returns the input as-is.
 * Cheat TypeScript, make it believe that the function is a class constructor.
 *
 * @public
 * @param ctor - a function that returns a object, or a function whose `this` is typed
 */
export function castConstructor<T, T2, U extends any[]>(
  ctor: (this: T, ...x: U) => T2,
): new (...x: U) => T2 extends void ? T : T2;
export function castConstructor(ctor: any) {
  return function (this: any) {
    // eslint-disable-next-line prefer-rest-params
    const ans = ctor.apply(this, arguments);
    if (ans) Object.assign(this, ans);
  } as unknown;
}

/**
 * Create a data class from a type.
 *
 * @public
 */
export const makeDataClass = <T>() => castConstructor((x: T) => ({ ...x }));

/**
 * Create a getter function from a dictionary.
 * You can use `/regex/i` as a key in the dictionary.
 *
 * @public
 * @param dict - the dictionary
 * @returns a getter function
 */
export function makeGetterFromDictionary<T>(dict: Record<string, T>) {
  const matchers: [RegExp, T][] = [];
  Object.keys(dict).forEach(key => {
    const reFlags = key.startsWith('/') && key.length >= 2 && /\/([umig]*)/.exec(key);
    if (!reFlags) return;

    matchers.push([new RegExp(key.slice(1, reFlags.index), reFlags[1]), dict[key]]);
  });
  const hasMatchers = matchers.length > 0;

  return function (input: string | number | undefined | void | null): T | undefined {
    if (input == null) return;

    const s = typeof input === 'string' ? input : String(input);
    if (Object.prototype.hasOwnProperty.call(dict, s)) return dict[s];

    const m = hasMatchers && matchers.find(([re]) => re.test(s));
    if (m) return m[1];
  };
}

/**
 * check if a value is object but not null
 *
 * @public
 */
export function isObject(value: any): value is Record<string | number | symbol, any> {
  return typeof value === 'object' && value !== null;
}

/**
 * check if a value is plain object / array, not a class instance
 *
 * this will read object's prototype
 *
 * @public
 */
export function isPlainObject(value: any): value is Record<string | number | symbol, any> {
  if (!isObject(value)) return false;

  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === Array.prototype || !proto;
}

/**
 * if input is array, this is identical to `Array#map`
 *
 * if input is object, this transform values.
 *
 * if input is a class instance, the return value will be a plain object.
 *
 * otherwise, return input as-is
 *
 * @public
 */
export function mapValues(objOrArray: any, mapper: (value: any, key: string | number, whole: any) => any) {
  if (!isObject(objOrArray)) return objOrArray;
  if (Array.isArray(objOrArray)) return objOrArray.map(mapper);
  return Object.keys(objOrArray).reduce((p, k) => {
    p[k] = mapper(objOrArray[k], k, objOrArray);
    return p;
  }, {} as Record<string, any>);
}

/**
 * @returns
 */
export function forEach(objOrArray: any, iter: (value: any, key: string | number, whole: any) => any) {
  if (!isObject(objOrArray)) return;
  if (Array.isArray(objOrArray)) return objOrArray.forEach(iter);
  for (const k of Object.keys(objOrArray)) {
    if (!Object.hasOwnProperty.call(objOrArray, k)) continue;
    iter(objOrArray[k], k, objOrArray);
  }
}

export function shallowClone<T = any>(x: T): T {
  if (typeof x !== 'object' || x === null) return x;
  if (Array.isArray(x)) return x.slice() as unknown as T;
  return Object.assign({}, x);
}

export function cloneDeep(src: any, opts?: { freeze?: boolean }): any {
  const visitedMap = new WeakMap();
  const convert = (x: any) => {
    if (typeof x !== 'object' || x === null) return x;
    let cloned = visitedMap.get(x)
    if (!cloned) {
      cloned = Array.isArray(x) ? new Array(x.length) : {};
      visitedMap.set(x, cloned);
      for (const k of Object.keys(x)) cloned[k] = convert(x[k]);
      if (opts && opts.freeze) Object.freeze(cloned);
    }

    return cloned;
  }

  return convert(src);
}

/**
 * if `src` is an array, return a slice without nil values.
 * otherwise return `[]` if `src` is nil, or `[src]` if not.
 * 
 * note: "nil value" equals `null / undefined / "" / false / NaN`, not including zero number
 * 
 * @param src 
 * @returns 
 */
export function toArray<T = any>(src: T | Iterable<T | null | undefined> | null | undefined): T[] {
  const isNil = (x: any): x is null | undefined | '' | false | void => x == null || x === '' || x === false || Number.isNaN(x);

  if (isNil(src)) return [];
  if (!src) return [];
  if (typeof src === 'object' && (Symbol.iterator in src)) return Array.from(src as any).filter(v => !isNil(v)) as T[];
  return [src] as T[];
}

export function get<T = any>(obj: any, path: (string | number)[]): T {
  if (!Array.isArray(path)) return obj;

  for (const k of path) {
    if (typeof obj !== 'object' || obj === null) break;
    if (k === '__proto__') break;
    obj = obj[k];
  }

  return obj;
}
