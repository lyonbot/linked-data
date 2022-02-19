type Path = string[];

export class TrieNode<T> {
  key: string;
  path: Path;
  parent?: TrieNode<T>;
  children?: Record<string, TrieNode<T>>;

  value?: T;

  constructor();
  constructor(parent: TrieNode<T>, key: string);
  constructor(parent?: TrieNode<T>, key?: string) {
    if (parent && typeof key === 'string') {
      this.path = [...parent.path, key];
      this.parent = parent;
      this.key = key;
    } else {
      this.key = '';
      this.path = [];
    }
  }

  getNodeAt(path: Path, createIfNotExist: true): TrieNode<T>;
  getNodeAt(path: Path, createIfNotExist?: boolean): TrieNode<T> | undefined;
  getNodeAt(path: Path, createIfNotExist?: boolean): TrieNode<T> | undefined {
    let head = this as TrieNode<T>;

    for (let i = 0; i < path.length; i++) {
      const key = path[i];
      const next = head.children && head.children[key];

      if (next) {
        head = next;
        continue;
      }

      if (!createIfNotExist) return undefined;

      const newNext = new TrieNode<T>(head, key);

      if (!head.children) head.children = { [key]: newNext };
      else head.children[key] = newNext;

      head = newNext;
    }

    return head;
  }

  getValueAt(path: Path): T | undefined {
    return this.getNodeAt(path)?.value;
  }

  setValueAt(path: Path, value: T) {
    this.getNodeAt(path, true).value = value;
  }

  deleteChild(key: string) {
    if (!this.children) return;
    delete this.children[key];
  }

  clearChildren() {
    if (!this.children) return;
    this.children = void 0;
  }

  setKey(newKey: string) {
    const { parent, key: oldKey } = this;
    if (!parent) return;

    const pPos = this.path.length - 1;

    this.key = newKey;

    // modify parent
    delete parent.children![oldKey];
    parent.children![newKey] = this;

    // modify nested children
    const queue = [this as TrieNode<T>];
    while (queue.length) {
      const item = queue.pop()!;
      item.path[pPos] = newKey;
      if (item.children) queue.push(...Object.values(item.children));
    }
  }

  /**
   * iterate through this node (including self).
   *
   * nodes with higher depth are always visited than those with less depth
   */
  forEachDFS(visitor: (node: TrieNode<T>) => void) {
    const { children } = this;
    if (children) {
      Object.values(children).forEach(child => {
        child.forEachDFS(visitor);
      });
    }
    visitor(this);
  }
}
