import { toRef } from './DataNodeRef';
import { DataNode, LinkedData } from './LinkedData';
import { SchemaDescriptor } from './schema';
import { directRefCount } from './utils/testUtils';

describe('LinkedData', () => {
  it('should work', () => {
    const ld = new LinkedData({});
    const node1: DataNode<any> = ld.import('hello');
    const node2: DataNode<any> = ld.import('world');
    const node3: DataNode<any> = ld.import({ a: node1.ref, b: [node2.ref, 'test'] });

    expect(node1.export()).toEqual('hello');
    expect(node2.export()).toEqual('world');
    expect(node3.export()).toEqual({ a: 'hello', b: ['world', 'test'] });

    expect(directRefCount(node3, node1)).toBe(1);
    expect(directRefCount(node3, node2)).toBe(1);

    // refer node2 twice

    node1.value = { test: node2.ref };
    node2.value = 'test';
    node3.value.b.push(node1.ref);

    expect(directRefCount(node1, node2)).toBe(1);
    expect(directRefCount(node3, node1)).toBe(2);

    expect(node1.export()).toEqual({ test: 'test' });
    expect(node2.export()).toEqual('test');
    expect(node3.export()).toEqual({ a: { test: 'test' }, b: ['test', 'test', { test: 'test' }] });

    const exp = node3.export();
    expect(exp.a).toBe(exp.b[2]); // same ref

    // make a loop reference
    {
      node1.value = node3.ref;
      node2.value = { master: node3.ref };
      const loop = node3.export();
      expect(loop.a).toBe(loop);
      expect(loop.b[0].master).toBe(loop);
      expect(loop.b[2]).toBe(loop);

      expect(directRefCount(node1, node3)).toBe(1);
      expect(directRefCount(node1, node2)).toBe(0); // removed
      expect(directRefCount(node3, node1)).toBe(2);

      node2.value = { master: node3.ref };
      expect(directRefCount(node2, node3)).toBe(1);
    }

    // another way to make a loop reference

    {
      node1.value = node3.value;
      node2.value = { master: node3.value };

      expect(node1.value).toBe(node3.value);
      expect(node3.value.b[0]).toBe(node2.value);

      const loop = node3.export();

      expect(loop.a).toBe(loop);
      expect(loop.b[0].master).toBe(loop);
      expect(loop.b[2]).toBe(loop);
    }
  });

  it('allocateId', () => {
    const ld = new LinkedData({});

    ld.createVoidNode({ id: 'foo' });
    ld.createVoidNode({ id: 'foo.2' });

    expect(ld.allocateId('foo')).toBe('foo.1');
    expect(ld.allocateId('foo.2')).toBe('foo.3');

    ld.createVoidNode({ id: 'foo.1' });

    expect(ld.allocateId('foo')).toBe('foo.3');
    expect(ld.allocateId('foo.2')).toBe('foo.3');
  });

  const schemas: Record<string, SchemaDescriptor> = {
    Message: {
      type: 'object',
      key: 'id',
      properties: {
        replies: { type: 'array', items: 'Message' },
      },
    },
  };

  it('follows schema', () => {
    const ld = new LinkedData({
      schemas,
    });

    const data = {
      id: '7b433e',
      text: "Hello who's there?",
      replies: [
        {
          text: 'Hello, I am here.',
        },
        {
          text: 'Hello, I am here too.',
          replies: [
            {
              id: '7b433e', // duplicated but will be fixed later
              text: 'Who are you',
              replies: [
                {
                  text: 'I am a robot.',
                },
              ],
            },
          ],
        },
      ],
    };
    const node1 = ld.import(data, 'Message');

    expect(ld._nodes.size).toBe(8);
    expect(node1.value).toEqual(data);
    expect(ld.getNode(node1.id)).toBe(node1);
    expect(ld.getNode('7b433e')).toBeTruthy();
    expect(ld.getNode('7b433e.1')).toBeTruthy(); // duplicated id, added suffix .1

    // use existing Nodes in the data to import

    const data2 = {
      text: 'Party time',
      replies: [node1, node1.ref, node1.value], // ref in 3 ways
      a: null as any,
      b: [] as any[],
      c: { x: null as any },
    };
    const node2 = ld.import(data2, 'Message');

    expect(ld._nodes.size).toBe(10);
    expect(node2.value.replies[0]).toBe(node1.value);
    expect(node2.value.replies[1]).toBe(node1.value);
    expect(node2.value.replies[2]).toBe(node1.value);

    // add ref to unknown property

    for (const ref of [node1, node1.ref, node1.value]) {
      // set a proxy / ref / node itself
      node2.value.a = ref;
      node2.value.b.unshift(ref);
      node2.value.c.x = ref;

      // when read, always get the proxy
      expect(node2.value.a).toBe(node1.value);
      expect(node2.value.b[0]).toBe(node1.value);
      expect(node2.value.c.x).toBe(node1.value);

      // in the exported, share same ref
      const exported = node2.export();
      const exportedNode1 = exported.a;
      expect(exported.b[0]).toBe(exportedNode1);
      expect(exported.c.x).toBe(exportedNode1);
    }

    // directly import existing node (or node's ref, node's proxy value)
    // will NOT create new node

    for (const ref of [node1, node1.ref, node1.value]) {
      expect(ld.import(ref, 'Message')).toBe(node1);
      expect(() => ld.import(ref, 'InvalidSchema')).toThrow('Schema');
      expect(ld._nodes.size).toBe(10);
    }

    // create node by setting value

    node2.value.replies = []; // -> create a node
    node2.value.b = [];
    expect(ld._nodes.size).toBe(11);
  });

  it('import: overwrite', () => {
    const ld = new LinkedData({
      schemas: {
        Human: {
          type: 'object',
          key: 'id',
          properties: {
            friends: { type: 'array', items: 'Human' },
          },
        },
        Dalek: {
          type: 'object',
          key: 'id',
          properties: {
            friends: { type: 'array', items: 'Dalek' },
            earthFriends: { type: 'array', items: 'Human' },
          },
        },
      },
    });

    const tonyData = {
      id: 'tony',
      name: 'Tony Stark',
      friends: [
        {
          id: 'john',
          name: 'John Smith',
        },
        {
          id: 'river',
          name: 'River Song',
        },
      ],
    };

    const $tony = ld.import(tonyData, 'Human');
    expect($tony.id).toBe('tony');
    expect(ld._nodes.size).toBe(4); // 3 Human + 1 HumanArray

    const $tony2 = ld.import(tonyData, 'Human');
    expect(ld._nodes.size).toBe(8);
    expect($tony2).not.toBe($tony);
    expect($tony2.id).not.toBe('tony');

    const $tony3 = ld.import(tonyData, 'Human', { overwrite: 'always' });
    expect(ld._nodes.size).toBe(8 + 1); // old nodes are overwritten, but arrays are always recreated
    expect($tony3.id).toBe('tony');
    expect($tony3).not.toBe($tony);
    expect(ld.getNode('tony')).toBe($tony3);

    // -------------
    // same-schema: this will overwrite only if node has same schema
    // so "tony" the Dalek will not overwrite "tony" the Human
    // but "john" the Human will overwrite existing "john" the Human

    const last$tony = ld.getNode('tony');
    const last$john = ld.getNode('john');
    const davrosData = {
      id: 'Davros',
      friends: [{ id: 'tony' }], // this is a Dalek have the same name as "tony" Human
      earthFriends: [
        {
          id: 'john',
          name: 'John Smith',
          species: 'Time Lord',
        },
      ],
    };

    const $davros = ld.import(davrosData, 'Dalek', { overwrite: 'same-schema' });

    expect(ld._nodes.size).toBe(9 + 4); // added 2 Dalek + 1 HumanArray + 1 DalekArray
    expect($davros.id).toBe('Davros');

    const $tonyDalek = toRef($davros.value.friends[0])!.node!;
    const $john = toRef($davros.value.earthFriends[0])!.node!;

    expect($john.id).toBe('john');
    expect(ld.getNode('john')).toBe($john); // overwritten
    expect(last$john).not.toBe($john);

    expect($tonyDalek.id).not.toBe('tony'); // not overwritten
    expect(ld.getNode('tony')).not.toBe($tonyDalek); // not overwritten
    expect(ld.getNode('tony')).toBe(last$tony); // not overwritten

    // -------------
    // custom logic
    // every Dalek except Davros, can be replaced with another same-id Dalek

    const fakeDavros2Data = {
      id: 'Davros',
      friends: [{ id: $tonyDalek.id }],
    };
    const $davros2 = ld.import(fakeDavros2Data, 'Dalek', {
      overwrite: (data, node, schema) => {
        // secure overwrite only if node has same schema
        if (schema !== node.schema) return false;

        // a Davros can not be replaced with another Davros
        if (schema.$id === 'Dalek' && node.id === 'Davros') return false;

        // otherwise it's secure to overwrite
        return true;
      },
    });

    expect(ld.getNode('Davros')).not.toBe($davros2);
    expect(ld.getNode('Davros')).toBe($davros); // not overwritten

    expect(ld.getNode($tonyDalek.id)).not.toBe($tonyDalek); // id is taken by new tony Dalek

    expect(ld._nodes.size).toBe(9 + 4 + 2); // added 1 Dalek (FakeDavros) + 1 DalekArray, overwrite 1 tonyDalek
  });

  it('DataNode: store non-object value', () => {
    const ld = new LinkedData({ schemas });

    const textNode = ld.import("I'm a string");
    const msgNode = ld.import({ text: textNode }, 'Message');

    const exported = msgNode.export();
    expect(exported).toEqual({ text: "I'm a string" });
    expect(msgNode.value).toEqual(exported);

    // modify textNode
    textNode.value = 'Awesome';
    expect(msgNode.value).toEqual({ text: 'Awesome' });
    expect(exported).toEqual({ text: "I'm a string" }); // old exported data is not affected
  });

  it('DataNode: export with(out) key', () => {
    const ld = new LinkedData({ schemas });

    const root = ld.import<any>(
      {
        text: 'test',
        replies: [{ text: 'test2' }, { text: 'test3' }],
      },
      'Message',
    );

    expect(root.export()).toEqual({
      text: 'test',
      replies: [{ text: 'test2' }, { text: 'test3' }],
    });

    expect(root.export({ writeKey: true })).toEqual({
      id: expect.any(String),
      text: 'test',
      replies: [
        {
          id: expect.any(String),
          text: 'test2',
        },
        {
          id: expect.any(String),
          text: 'test3',
        },
      ],
    });

    expect(
      root.export({
        writeKey: node => node.value.text !== 'test2',
      }),
    ).toEqual({
      id: expect.any(String),
      text: 'test',
      replies: [
        {
          // id: expect.any(String),
          text: 'test2',
        },
        {
          id: expect.any(String),
          text: 'test3',
        },
      ],
    });

    // if Node's value have a "id" property, and writeKey is true
    // the "id" from value will be overridden
    root.value.id = 'this will be overridden';
    const exported = root.export({ writeKey: true });
    expect(exported.id).not.toEqual('this will be overridden');
    expect(exported.id).toEqual(root.id);
  });

  it('DataNode: void node', () => {
    const ld = new LinkedData({});

    const node1 = ld.createVoidNode({});
    const node2 = ld.import({ foo: node1, bar: [node1.ref] });

    expect(() => node2.value).not.toThrow(); // as long as we don't read "foo"
    expect(() => node2.value.foo).toThrowError('void');
    expect(() => node2.value.bar).not.toThrow(); // as long as we don't read "0"
    expect(() => node2.value.bar[0]).toThrowError('void');
    expect(() => node2.export()).toThrowError('void');

    node1.value = 'test';

    expect(node2.value).toEqual({ foo: 'test', bar: ['test'] });
    expect(node2.export()).toEqual({ foo: 'test', bar: ['test'] });

    node1.setVoid();

    expect(() => node2.value).not.toThrow(); // as long as we don't read "foo"
    expect(() => node2.value.foo).toThrowError('void');
    expect(() => node2.value.bar).not.toThrow(); // as long as we don't read "0"
    expect(() => node2.value.bar[0]).toThrowError('void');
    expect(() => node2.export()).toThrowError('void');
  });

  it('DataNode: warn if not plain object', () => {
    let counter = 0;
    jest.spyOn(console, 'warn').mockImplementation((message: any) => {
      if (typeof message === 'string' && message.includes('only accept plain')) counter++;
    });
    const ld = new LinkedData({});

    class Temp {
      constructor(public value: any) {}
    }

    const node1 = ld.import({ text: 'Hello World' });

    const nodes: DataNode[] = [];

    // ----------------------
    // directly

    counter = 0;
    nodes.splice(0);
    nodes.push(
      // push lots of nodes
      ld.import(new Temp(node1)),
      ld.import(new Temp(node1.value)),
      ld.import(new Temp(node1.ref)),
    );

    expect(counter).toBe(nodes.length);

    for (const node of nodes) {
      expect(node.value).toEqual({
        // plain object, not a Temp instance anymore
        value: { text: 'Hello World' },
      });
    }

    // ----------------------
    // indirectly

    counter = 0;
    const node2 = ld.import<any>({ temp: new Temp(node1) });
    const node3 = ld.import<any>([new Temp(node1)]);
    expect(counter).toBe(2);
    expect(node2.value).toEqual({ temp: { value: { text: 'Hello World' } } }); // plain object, not a Temp instance anymore
    expect(node3.value).toEqual([{ value: { text: 'Hello World' } }]); // same

    // ----------------------
    // continue writing

    counter = 0;

    node2.value.t2 = new Temp(node1);
    node2.value.t3 = new Temp(node1.ref);
    node2.value.t4 = new Temp(node1.value);
    node2.value.t5 = { xxx: new Temp(node1.value), yyy: null };
    node2.value.t5.yyy = new Temp(node1.ref);
    node3.value.push(new Temp(node1));
    node3.value.push(new Temp(node1.ref));
    node3.value.push(new Temp(node1.value));

    expect(counter).toBe(8);

    expect(node2.value).toEqual({
      temp: { value: { text: 'Hello World' } },
      t2: { value: { text: 'Hello World' } }, // plain object
      t3: { value: { text: 'Hello World' } }, // plain object
      t4: { value: { text: 'Hello World' } }, // plain object
      t5: {
        xxx: { value: { text: 'Hello World' } }, // plain object
        yyy: { value: { text: 'Hello World' } }, // plain object
      },
    });
    expect(node3.value).toEqual([
      { value: { text: 'Hello World' } },
      { value: { text: 'Hello World' } }, // plain object
      { value: { text: 'Hello World' } }, // plain object
      { value: { text: 'Hello World' } }, // plain object
    ]);
  });
});
