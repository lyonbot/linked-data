/**
 * Convert a class constructor to a factory function.
 *
 * @public
 * @param ctor a class constructor
 */
export const createFactoryFromClass = <T extends new (...args: any[]) => any>(ctor: T) => {
  return function (...args: ConstructorParameters<T>): InstanceType<T> {
    return new ctor(...args);
  };
};

/**
 * This returns the input as-is.
 * Cheat TypeScript, make it believe that the function is a class constructor.
 *
 * @public
 * @param ctor a function that returns a object, or a function whose `this` is typed
 */
export function CastConstructor<T, T2, U extends any[]>(
  ctor: (this: T, ...x: U) => T2,
): new (...x: U) => T2 extends void ? T : T2;
export function CastConstructor(ctor: any) {
  return function (this: any) {
    // eslint-disable-next-line prefer-rest-params
    return ctor.apply(this, arguments);
  } as unknown;
}

/**
 * Create a data class from a type.
 *
 * @public
 */
export const makeDataClass = <T>() =>
  CastConstructor(function (this: T, data: T) {
    Object.assign(this, data);
  });

/**
 * Create a getter function from a dictionary.
 * You can use `/regex/i` as a key in the dictionary.
 *
 * @public
 * @param dict the dictionary
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

export function isObject(value: any): value is Record<string | number | symbol, any> {
  return typeof value === 'object' && value !== null;
}