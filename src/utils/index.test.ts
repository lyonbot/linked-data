import { cloneDeep, isPlainObject, mapValues } from './index';

describe('utils', () => {
  it('isPlainObject', () => {
    class Test { }

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

  it.each([
    [false],
    [true]
  ])('cloneDeep: looped object, freeze=%p', freeze => {
    const obj: any = { a: [1, 2, 3], b: null, c: null, d: void 0 }
    obj.b = obj;
    obj.a[0] = obj;

    const cloned = cloneDeep(obj, { freeze })

    expect(Object.keys(cloned)).toEqual(['a', 'b', 'c', 'd'])
    expect(cloned.a[0]).toBe(cloned)
    expect(cloned.a[1]).toBe(2)
    expect(cloned.a[2]).toBe(3)
    expect(cloned.a.length).toBe(3)
    expect(cloned.b).toBe(cloned)
    expect(cloned.c).toBe(null)
    expect(cloned.d).toBe(undefined)

    expect(Object.isFrozen(cloned)).toBe(freeze)
    expect(Object.isFrozen(cloned.a)).toBe(freeze)

    expect(cloned).not.toBe(obj)
  });
});
