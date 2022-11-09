import { PatchOp, Path } from './types';
import { TrieNode } from './Trie';
import { shallowClone, cloneDeep } from './utils';
import type { applyPatches } from './applyPatches';

/**
 * @public
 */
export interface DeriveReport {
  mutated?: TrieNode<any>;
  result: any;
}

/**
 * @public
 */
export interface DeriveOptions {
  /**
   * 在遇到 set 和 spliceArray 的时候，是否对数据做 cloneDeep？
   *
   * （默认为 true）
   */
  clone?: boolean;

  /**
   * 是否对修改后的东西 freeze
   *
   * （默认为 true）
   */
  freeze?: boolean;

  /** 完成 Patches 在返回前会触发的回调 */
  onFinish?: (report: DeriveReport) => void;
}

/**
 * following immutable philosophy, make a patched new result.
 *
 * if you want to directly patch the src object, try {@link applyPatches} method
 *
 * @see {@link applyPatches}
 * @public
 */
export function derive(src: any, patches: PatchOp[], options?: DeriveOptions) {
  const onFinish = options && options.onFinish;

  if (!Array.isArray(patches) || patches.length === 0) {
    if (typeof onFinish === 'function') onFinish({ result: src });
    return src;
  }

  const mutated = new TrieNode<any>();
  mutated.value = shallowClone(src);

  const freeze = !!(options?.freeze ?? true);
  const processValue: (x: any) => any = options?.clone ?? true ? val => cloneDeep(val, { freeze }) : x => x;

  /**
   * @param path 必须指向一个 array / object
   */
  const getMutateNodeAt = (path: Path) => {
    let head = mutated;
    for (let i = 0; i < path.length; i++) {
      const key = path[i];
      const nextHead = head.getNodeAt([key], true);

      if (typeof nextHead.value === 'undefined') {
        const newChildValue = shallowClone(head.value![key]);
        head.value[key] = newChildValue;
        nextHead.value = newChildValue;
      }
      head = nextHead;
    }

    return head;
  };

  for (let i = 0; i < patches.length; i++) {
    const patch = patches[i];
    const mutateNode = getMutateNodeAt(patch.path);

    switch (patch.op) {
      case 'delete': {
        const { key, parent: parentNode } = mutateNode;

        if (!parentNode) {
          // 对根节点操作
          throw new Error('Cannot apply patch: impossible to delete root node.');
        }

        if (Array.isArray(parentNode.value)) {
          // 对数组操作
          throw new Error('Cannot apply patch: Path points to an array element.');
        }

        parentNode.deleteChild(key);
        delete parentNode.value![key];
        break;
      }

      case 'set': {
        const { key, parent: parentNode } = mutateNode;
        const newValue = processValue(patch.value);

        mutateNode.clearChildren(); // 当前字段，所有的子节点都被洗掉
        mutateNode.value = newValue;

        // 如果不是对根节点做操作，那么要回写到父级
        if (parentNode) parentNode.value![key] = newValue;
        break;
      }

      case 'resortArray': {
        const oldArray = mutateNode.value as Array<any>;
        const newArray = new Array(patch.indexMap.length);

        const oldNodeChildren = mutateNode.children;
        const newNodeChildren = {} as Record<string, typeof mutateNode>;

        for (let ni = 0; ni < patch.indexMap.length; ni++) {
          const oi: number = patch.indexMap[ni];
          if (oi === -1) continue; // do not reuse

          newArray[ni] = oldArray[oi];

          const oldChildNode = oldNodeChildren?.[oi];
          if (oldChildNode) {
            oldChildNode.setKey(String(ni));
            newNodeChildren[ni] = oldChildNode;
          }
        }

        mutateNode.value = newArray;
        mutateNode.children = newNodeChildren;

        const { key, parent: parentNode } = mutateNode;
        if (parentNode) parentNode.value![key] = newArray;

        break;
      }
    }
  }

  const result = mutated.value;
  if (freeze) {
    mutated.forEachDFS(node => {
      // eslint-disable-next-line no-param-reassign
      node.value = Object.freeze(node.value);
    });
  }

  if (typeof onFinish === 'function') onFinish({ mutated, result });
  return result;
}
