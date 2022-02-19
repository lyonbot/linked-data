import { TrieNode } from './Trie';

describe('Trie', () => {
  it('getValueAt, setValueAt, setKey', () => {
    const tree = new TrieNode<any>();

    expect(tree.getValueAt(['foo', '3', 'aba'])).toBeUndefined();

    tree.setValueAt(['foo', '3', 'aba'], 'lorem');
    tree.getNodeAt(['foo', '3'])!.setKey('0');

    expect(tree.getValueAt(['foo', '3', 'aba'])).toBeUndefined();
    expect(tree.getValueAt(['foo', '0', 'aba'])).toBe('lorem');
  });
});
