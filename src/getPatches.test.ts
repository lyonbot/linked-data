import { derive } from './derive';
import { getPatches } from './getPatches';

describe('getPatches', () => {
  it('basically works', () => {
    const newest = {
      foo: [1, 2, 3],
      bar: { baz: 'baz', newest: 'newest' },
    };
    const oldest = {
      foo: [0, 1, 2],
      bar: { baz: 'old baz', deleted: 'I am removed' },
    };

    const { patches, revertPatches } = getPatches(
      {
        root: newest, oldRoot: newest, getOld:
          n => {
            if (n === newest.foo)
              return [0, 1, 2];
            if (n === newest.bar)
              return { baz: 'old baz', deleted: 'I am removed' };
          }
      },
    );

    expect(patches).toMatchSnapshot();
    expect(revertPatches).toMatchSnapshot();
    // console.log(patches);
    // console.log(revertPatches);

    expect(derive(oldest, patches)).toEqual(newest);
    expect(derive(newest, revertPatches)).toEqual(oldest);
  });

  it('whole replaced', () => {
    const newest = { foo: [1, 2, 3] };
    const oldest = { hey: 'yo' };

    const { patches, revertPatches } = getPatches(
      {
        root: newest, oldRoot: { hey: 'yo' }, getOld:
          n => {
            if (n === newest.foo)
              return [0, 1, 2];
          }
      },
    );

    expect(patches).toMatchSnapshot();
    expect(revertPatches).toMatchSnapshot();
    // console.log(JSON.stringify(patches, null, 2));
    // console.log(JSON.stringify(revertPatches, null, 2));

    expect(derive(oldest, patches)).toEqual(newest);
    expect(derive(newest, revertPatches)).toEqual(oldest);
  });

  it('resorted objects', () => {
    const newest = [{ x: 0 }, { x: 1 }, { x: 2 }, { x: 3 }];
    const oldest = [{ x: -3 }, { x: 2 }, { x: 1 }, { y: 555 }];

    const { patches, revertPatches } = getPatches(
      {
        root: newest, oldRoot: newest, getOld:
          n => {
            if (n === newest)
              return [newest[3], newest[2], newest[1], { y: 555 }];
            if (n === newest[0])
              return { x: 999 }; // meanless because newest[0] not exist in original array
            if (n === newest[3])
              return { x: -3 };
          }
      },
    );

    expect(patches).toMatchSnapshot();
    expect(revertPatches).toMatchSnapshot();
    // console.log(JSON.stringify(patches, null, 2));
    // console.log(JSON.stringify(revertPatches, null, 2));

    expect(derive(oldest, patches)).toEqual(newest);
    expect(derive(newest, revertPatches)).toEqual(oldest);
  });
});
