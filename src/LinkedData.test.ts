import { DataNode, LinkedData } from './LinkedData';
import { SchemaDescriptor } from './schema';

describe('LinkedData', () => {
  it('should work', () => {
    const ld = new LinkedData({});
    const node1: DataNode<any> = ld.import('hello');
    const node2: DataNode<any> = ld.import('world');
    const node3: DataNode<any> = ld.import({ a: node1.ref, b: [node2.ref, 'test'] });

    expect(node1.export()).toEqual('hello');
    expect(node2.export()).toEqual('world');
    expect(node3.export()).toEqual({ a: 'hello', b: ['world', 'test'] });

    // refer node2 twice

    node1.value = { test: node2.ref };
    node2.value = 'test';
    node3.value.b.push(node1.ref);

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
    expect(ld.getNode('7b433e2')).toBeTruthy(); // duplicated id, added suffix 2

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
});
