import { dumpDataNodes, loadDataNodes } from './loadDump';
import { LinkedData } from './LinkedData';

describe('loadDump', () => {
  it('should work', () => {
    const ld = new LinkedData({
      schemas: {
        Message: {
          type: 'object',
          key: 'id',
          properties: {
            replies: { type: 'array', items: 'Message' },
          },
        },
      },
    });

    const data = {
      id: 'foo',
      text: 'Hello',
      replies: [
        { id: 'bar', text: 'Hi' },
        { id: 'baz', text: 'Bye' },
        { id: 'foo', text: 'Hey?' }, // duplicated id
      ],
    };

    const node = ld.import(data, 'Message');
    const node2 = ld.createVoidNode({});
    node2.value = node.ref;
    node.value.replies.push(node2.value); // self circle

    const dumped0 = dumpDataNodes(node);
    expect(dumped0).toMatchSnapshot('dumped');

    const dumped = dumpDataNodes(node, { writeKey: true });
    expect(dumped).toMatchSnapshot('dumped with writeKey');
    expect(dumped.nodeInfos['foo.1'].raw.id).not.toBe('foo');
    // console.log(JSON.stringify(dumped, null, 2));

    // ----------------------------------------------------------------

    const loaded = loadDataNodes(ld, dumped.nodeInfos);
    expect(Object.keys(loaded).length).toBe(Object.keys(dumped.nodeInfos).length);

    const node3 = loaded[node.id];
    const dump3 = dumpDataNodes(node3);
    expect(dump3).toMatchSnapshot('loaded');
    expect(node3.id).not.toBe(node.id);
  });
});
