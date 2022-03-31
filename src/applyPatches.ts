import { AnyObject, PatchOp } from './types';
import type { derive } from './derive';

/**
 * apply patches to object. if you don't want to pollute src, you should try {@link derive}
 *
 * @public
 * @see {@link derive}
 * @returns modified result -- usually the same as `root`
 */
export function applyPatches(root: any, patches: PatchOp[]): any {
  if (patches.length === 0) return root;

  const container = { root };

  for (const patch of patches) {
    const { op } = patch;
    const path = ['root', ...patch.path];

    const key = path[path.length - 1]!;
    const target = path.slice(0, -1).reduce((target: any, key) => target && target[key], container as AnyObject);

    if (!target) throw new Error(`Invalid path ${JSON.stringify(path)}`);

    switch (op) {
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
