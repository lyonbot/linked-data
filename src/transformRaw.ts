import { DataNodeRef, toRef } from './DataNodeRef';
import { DataNode } from './LinkedData';
import { isObject, mapValues } from './utils';
import type { AnyObject } from './types';

export interface TransformOptions {
  createDest(raw: any, node: DataNode | null, path: (string | number)[]): any;
  fillDest(q: Q): void;
}

type Q = {
  dest: any;
  recipe: AnyObject;
  raw: any;
  node: DataNode | null;
  path: (string | number)[];
};

export function transformRaw(entryRaw: DataNodeRef | any, options: TransformOptions) {
  const cache = new WeakMap<any, any>(); // key => dest
  const needFilling: Q[] = [];

  const convert1 = (raw: any, path: Q['path']) => {
    let node: DataNode | null = null;
    // TODO: detect ref -> ref -> ref cycle
    for (let ref = toRef(raw); ref; ref = toRef(raw)) {
      node = ref.node;
      raw = node.raw;
    }
    if (cache.has(raw)) return cache.get(raw);

    let dest = options.createDest(raw, node, path);
    let currentNeedFill = true;

    if (isObject(dest) && dest instanceof Final) {
      currentNeedFill = false;
      dest = dest.value;
    }
    currentNeedFill = currentNeedFill && isObject(dest) && isObject(raw);

    if (isObject(raw)) cache.set(raw, dest);
    if (currentNeedFill) {
      const prepared = mapValues(raw, (v, k) => convert1(v, [...path, k]));
      needFilling.push({ dest, recipe: prepared, raw, node, path });
    }

    return dest;
  };

  const ans = convert1(entryRaw, []);
  while (needFilling.length) options.fillDest(needFilling.pop()!);

  return ans;
}

export class Final {
  constructor(public value: any) {}
}

transformRaw.final = (value: any) => new Final(value);
