import { isPlainObject, mapValues } from './index';

describe('utils', () => {
  it('isPlainObject', () => {
    class Test {}

    expect(isPlainObject('')).toBe(false);
    expect(isPlainObject(Test)).toBe(false);
    expect(isPlainObject(new Test())).toBe(false);

    expect(isPlainObject({})).toBe(true);
    expect(isPlainObject([])).toBe(true);
    expect(isPlainObject(Object.create(null))).toBe(true);
  });

  it('mapValues: object', () => {
    const obj = { a: 1, b: 2, c: 3 };
    const mapper = jest.fn(v => v + 1);

    expect(mapValues(null, mapper)).toBe(null);
    expect(mapValues('str', mapper)).toBe('str');

    expect(mapValues(obj, mapper)).toEqual({ a: 2, b: 3, c: 4 });
    expect(mapper).toHaveBeenCalledTimes(3);
    expect(mapper).toHaveBeenNthCalledWith(1, 1, 'a', obj);
    expect(mapper).toHaveBeenNthCalledWith(2, 2, 'b', obj);
    expect(mapper).toHaveBeenNthCalledWith(3, 3, 'c', obj);

    // ----------------------------------------------------------------
    mapper.mockClear();

    class DumbClass {
      a: number;
      b: number;
      c: number;
      constructor(a: number, b: number, c: number) {
        this.a = a;
        this.b = b;
        this.c = c;
      }
    }

    // It's a object, not DumbClass instance
    const dumb = new DumbClass(1, 2, 3);
    expect(mapValues(dumb, mapper)).toEqual({ a: 2, b: 3, c: 4 });
    expect(mapper).toHaveBeenCalledTimes(3);
    expect(mapper).toHaveBeenNthCalledWith(1, 1, 'a', obj);
    expect(mapper).toHaveBeenNthCalledWith(2, 2, 'b', obj);
    expect(mapper).toHaveBeenNthCalledWith(3, 3, 'c', obj);
  });

  it('mapValues: array', () => {
    const arr = [1, 2, 3];
    const mapper = jest.fn(v => v + 1);

    expect(mapValues(arr, mapper)).toEqual([2, 3, 4]);
    expect(mapper).toHaveBeenCalledTimes(3);
    expect(mapper).toHaveBeenNthCalledWith(1, 1, 0, arr);
    expect(mapper).toHaveBeenNthCalledWith(2, 2, 1, arr);
    expect(mapper).toHaveBeenNthCalledWith(3, 3, 2, arr);
  });
});
