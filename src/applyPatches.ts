import { PatchOp } from './types';
import { get } from './utils';
import type { derive } from './derive';

/**
 * apply patches to object directly.
 * 
 * this will mutate `root`. if you want to keep things immutable, you should try {@link derive}
 *
 * @public
 * @see {@link derive}
 * @returns modified result -- usually the same as `root`
 */
export function applyPatches(root: any, patches: PatchOp[]): any {
  if (!Array.isArray(patches) || patches.length === 0) return root;

  const container = { root };

  for (const patch of patches) {
    const parentPath = ['root', ...patch.path];
    const key = parentPath.pop()!;

    const target = get(container, parentPath);
    if (!target) throw new Error(`Invalid path ${JSON.stringify([...parentPath, key])}`);

    switch (patch.op) {
      case 'set': {
        target[key] = patch.value;
        break;
      }

      case 'delete': {
        if (Array.isArray(target)) throw new Error('Cannot operate delete on an array');
        delete target[key];
        break;
      }

      case 'resortArray': {
        const oldArray = target[key];
        if (!Array.isArray(oldArray)) throw new Error('Cannot operate resortArray');
        target[key] = patch.indexMap.map(oi => (oi === -1 ? void 0 : oldArray[oi]));
        break;
      }
    }
  }

  return container.root;
}
