import { isObject, forEach, cloneDeep } from './utils';
import type { AnyObject, PatchOp, Path } from './types';

// a placeholder
const $taken = Symbol('taken');

interface GetPatchesOptions {
  root: any;
  oldRoot: any;
  getOld: (newObj: AnyObject) => AnyObject | null | undefined;
  processPatchValues?: (newObj: AnyObject) => AnyObject;
}

export function getPatches({
  root, //
  oldRoot,
  getOld,
  processPatchValues = cloneDeep,
}: GetPatchesOptions) {
  const wrapper = { root };
  const compareQueue: [AnyObject, AnyObject | null | undefined, Path | null][] = [
    [wrapper, root === oldRoot ? wrapper : { root: oldRoot }, null],
  ];

  const patches: PatchOp[] = [];
  const revertPatches: PatchOp[] = [];
  const ignoredNvs = new Set<any>();

  while (compareQueue.length) {
    const [nv, ov, vPath] = compareQueue.shift()!;

    if (ignoredNvs.has(nv)) continue;

    // queue sub-items
    forEach(nv, (value, key) => {
      if (!isObject(value)) return;
      compareQueue.push([value, getOld(value), vPath ? [...vPath, key] : []]);
    });

    // this object is not changed? skip it.
    if (!ov || ov === nv) continue;

    // this object is a changed array.
    // (smart hint: `path` is always available for array)
    if (Array.isArray(nv)) {
      const subPatches: PatchOp[] = [];
      const subRevertPatches: PatchOp[] = [];
      const oldArr = (ov as any[]).slice();

      let guessDelta = 0;
      let identical = nv.length === oldArr.length;
      const indexMap = nv.map((value, index) => {
        const guessedOi = index + guessDelta;
        const oi = oldArr[guessedOi] === value ? guessedOi : oldArr.indexOf(value);

        if (identical && oi !== index) identical = false;

        if (oi === -1) {
          if (isObject(value)) ignoredNvs.add(value);
          subPatches.push({
            op: 'set',
            path: [...vPath!, index],
            value: processPatchValues(value),
          });
          return -1;
        }

        guessDelta = oi - index;
        oldArr[oi] = $taken;
        return oi;
      });

      if (!identical) {
        subPatches.unshift({
          op: 'resortArray',
          path: vPath!,
          indexMap,
        });

        const revertIndexMap = oldArr.map((value, index) => {
          const ans = indexMap.indexOf(index);
          if (ans === -1) {
            subRevertPatches.push({
              op: 'set',
              path: [...vPath!, index],
              value: processPatchValues(value),
            });
          }

          return ans;
        });
        subRevertPatches.push({
          op: 'resortArray',
          path: vPath!,
          indexMap: revertIndexMap,
        });
      }

      patches.push(...subPatches);
      revertPatches.push(...subRevertPatches);
    } else {
      // this is just a changed object.
      const oKeys = new Set(Object.keys(ov));

      Object.keys(nv).forEach(key => {
        const value = (nv as any)[key];
        if (isObject(value)) ignoredNvs.add(value);

        const hadKey = oKeys.has(key);
        const needSet = !hadKey || value !== (ov as any)[key];

        oKeys.delete(key);
        if (needSet) {
          const path = vPath ? [...vPath, key] : [];
          patches.push({ op: 'set', path, value: processPatchValues(value) });

          if (hadKey) revertPatches.push({ op: 'set', path, value: processPatchValues((ov as any)[key]) });
          else revertPatches.push({ op: 'delete', path });
        }
      });

      oKeys.forEach(key => {
        const path = vPath ? [...vPath, key] : [];
        patches.push({ op: 'delete', path });
        revertPatches.push({ op: 'set', path, value: processPatchValues((ov as any)[key]) });
      });
    }
  }

  return { patches, revertPatches: revertPatches.reverse() };
}
