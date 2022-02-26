import { derive } from './derive';
import { PatchOp } from './types';

describe('derive', () => {
  it('works', () => {
    const a = {
      arr: [{ id: 1 }, { id: 2 }, { id: 3, extra: 'hello' }],
      wtf: false,
    };
    const b = {
      arr: [{ id: 3, extra: 'world' }, { id: 2 }, { id: 999 }],
    };
    const patches: PatchOp[] = [
      { op: 'delete', path: ['wtf'] },
      { op: 'resortArray', path: ['arr'], indexMap: [2, 1, -1] }, // 首先是对数组做重排
      { op: 'set', path: ['arr', 2], value: { id: 999 } },
      { op: 'set', path: ['arr', 0, 'extra'], value: 'world' },
    ];

    const ans = derive(a, patches) as typeof b;
    expect(ans).toEqual(b);
    expect(ans.arr[1]).toBe(a.arr[1]); // 没有被修改到的东西要保持原样

    // 不要污染src
    expect(a).toEqual({
      arr: [{ id: 1 }, { id: 2 }, { id: 3, extra: 'hello' }],
      wtf: false,
    });

    // 不要直接复用 patches 里提供的对象( {id:999} ），应该是一个拷贝！
    expect(a.arr[2]).not.toBe((patches[2] as any).value);
  });

  it('works2: replace deep', () => {
    const a = {
      foo: { bar: { baz: 'hello', wtf: {} } },
    };
    const b = {
      foo: { bar: { baz: 'world', wtf: {} } },
    };
    const patches: PatchOp[] = [{ op: 'set', path: ['foo', 'bar', 'baz'], value: 'world' }];

    const ans = derive(a, patches) as typeof b;
    expect(ans).toEqual(b);
    expect(ans.foo.bar.wtf).toBe(a.foo.bar.wtf); // 没有被修改到的东西要保持原样

    // 不要污染src
    expect(a).toEqual({
      foo: { bar: { baz: 'hello', wtf: {} } },
    });
  });

  it('cannot delete array item', () => {
    expect(() => {
      derive([1, 2, 3], [{ op: 'delete', path: [0] }]);
    }).toThrowError('Cannot apply patch: Path points to an array element');
  });

  it('resortArray twice', () => {
    const patches: PatchOp[] = [
      { op: 'resortArray', path: ['foo', 0], indexMap: [1, 0, 2] },
      { op: 'resortArray', path: ['foo'], indexMap: [1, 0, 2] },
      { op: 'set', path: ['foo', 0, 0], value: 888 },
    ];

    const a = {
      foo: [
        [1, 2, 3],
        [4, 5, 6],
        [7, 8, 9],
      ],
    };
    const b = {
      foo: [
        [888, 5, 6],
        [2, 1, 3],
        [7, 8, 9],
      ],
    };
    expect(derive(a, patches)).toEqual(b);
  });

  it('temp1', () => {
    const ansOpts: PatchOp[] = [
      { op: 'set', path: ['foo', 2, 1], value: '哦' },
      { op: 'set', path: ['foo', 2, 0], value: 'x' },
      { op: 'set', path: ['foo', 2, 2], value: '啊' },
      { op: 'resortArray', path: ['foo', 2], indexMap: [1, 0, 2] },
      { op: 'resortArray', path: ['foo'], indexMap: [0, 2, 1] },
    ];

    const test = derive({ foo: ['a', 'b', ['a', 'b', 'c']] }, ansOpts);
    expect(test).toEqual({ foo: ['a', ['哦', 'x', '啊'], 'b'] });
  });
});
