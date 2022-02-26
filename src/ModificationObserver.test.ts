import { LinkedData } from './LinkedData';
import { ModificationObserver } from './ModificationObserver';

describe('ModificationObserver', () => {
  it('should work', done => {
    const ld = new LinkedData({});
    const callback = jest.fn();
    const observer = new ModificationObserver(callback);

    const node1 = ld.import<any>({
      name: 'node1',
      arr: [1, 2, 3],
      obj: { a: 1, b: 2 },
    });

    const node2 = ld.import<any>({
      name: 'node2',
      arr: [1, 2, 3],
      obj: { a: 1, b: 2 },
      ref: node1.ref,
    });

    const node3 = ld.import<any>({});
    node3.setValue(node2.ref); // force a redundant node

    // --------------------------------------------
    // those modifications should be ignored
    // because we haven't start observing

    node2.value.arr.unshift(0);
    delete node1.value.obj.a;

    expect(callback).not.toBeCalled();

    // --------------------------------------------

    observer.observeLinkedData(ld);
    callback.mockImplementationOnce(ob => {
      try {
        expect(ob).toBe(observer);

        const b1 = observer.takeRecords(true);
        const b2 = observer.takeRecords();
        const b3 = observer.takeRecords(); // at this moment, things are clear

        expect(b1).toEqual(b2);
        expect(b3.length).toBe(0);

        // b1.forEach(item => {
        //   console.log('==================' + item.node.id)
        //   console.log('[Patches]')
        //   console.log(item.patches)
        //   console.log('[RevertPatches]')
        //   console.log(item.revertPatches)
        //   console.log('==================')
        // })

        expect(b1.length).toBe(4);

        // ----------------------------------------------------------------

        const mToNode2 = b1.find(x => x.node === node2)!;
        expect(mToNode2.isNewNode).toBeFalsy();
        expect(mToNode2.patches).toEqual([
          { op: 'resortArray', path: ['arr'], indexMap: [0, 1, 2, 3, -1] },
          { op: 'set', path: ['arr', 4], value: 4 },
        ]);
        expect(mToNode2.revertPatches).toEqual([
          { op: 'resortArray', path: ['arr'], indexMap: [0, 1, 2, 3] }, // resort back
        ]);

        // ----------------------------------------------------------------

        const mToNode1 = b1.find(x => x.node === node1)!;
        expect(mToNode1.isNewNode).toBeFalsy();
        expect(mToNode1.patches).toEqual([
          { op: 'set', path: ['obj', 'a'], value: node3.ref }, // new item
        ]);
        expect(mToNode1.revertPatches).toEqual([
          { op: 'delete', path: ['obj', 'a'] }, // heck off
        ]);

        // ----------------------------------------------------------------

        const mToNode3 = b1.find(x => x.node === node3)!;
        expect(mToNode3.isNewNode).toBeFalsy();
        expect(mToNode3.patches).toEqual([
          { op: 'set', path: [], value: 'hello' }, //
        ]);
        expect(mToNode3.revertPatches).toEqual([
          { op: 'set', path: [], value: node2.ref }, //
        ]);

        // ----------------------------------------------------------------

        const mToNode4 = b1.find(x => x.node === node4)!;
        expect(mToNode4.isNewNode).toBe(true);
        expect(mToNode4.patches).toEqual([
          { op: 'set', path: [], value: { hello: 123, world: 456, arr: [1, 2] } }, // new node
        ]);
        expect(mToNode4.revertPatches).toEqual([
          { op: 'set', path: [], value: undefined }, // new node had no value
        ]);

        // ----------------------------------------------------------------

        done();
      } catch (error: any) {
        done(error);
      }
    });

    node2.value.arr.push(4);
    node1.value.obj.a = node3.ref;
    node3.value = 'hello';

    // create a new node
    const node4 = ld.import<any>({ hello: 123, arr: [1] });
    node4.value.world = 456;
    node4.value.arr.push(2); // any further modification to new value will be discarded
  });

  it('Schema', done => {
    const ld = new LinkedData({
      schemas: {
        Box: {
          type: 'object',
          properties: {
            sub: 'Box',
          },
        },
      },
    });

    const callback = jest.fn();
    const observer = new ModificationObserver(callback);

    observer.observeLinkedData(ld);
    callback.mockImplementationOnce(() => {
      try {
        const records = observer.takeRecords();

        expect(records.length).toBe(3);
        records.forEach(record => {
          expect(record.isNewNode).toBe(true);
          expect(record.patches.length).toBe(1);
          expect(record.patches[0]).toEqual({
            op: 'set',
            path: [],
            value: expect.any(Object),
          });
        });

        expect(records.some(record => record.node === node1)).toBe(true);

        done();
      } catch (err: any) {
        done(err);
      }
    });

    const node1 = ld.import<any>(
      {
        name: 'box1',
        sub: { name: 'box2', sub: { name: 'box3' } },
      },
      'Box',
    );
  });
});
