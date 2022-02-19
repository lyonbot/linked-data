import { mapValues } from 'lodash';
import { DataNodeRef, toRef } from './DataNodeRef';
import { DataNode } from './LinkedData';
import { isObject } from './utils';

export interface TransformOptions {
  createDest(raw: any, node: DataNode | null): any;
  fillDest(q: Q): void;
}

type Q = {
  dest: any;
  prepared: any;
  raw: any;
  node: DataNode | null;
};

export function transformRaw(entryRaw: DataNodeRef | any, options: TransformOptions) {
  const cache = new WeakMap<any, any>(); // key => dest
  const needFilling: Q[] = [];

  const convert1 = (raw: any) => {
    let node: DataNode | null = null;
    // TODO: detect ref -> ref -> ref cycle
    for (let ref = toRef(raw); ref; ref = toRef(raw)) {
      node = ref.node;
      raw = node._raw;
    }
    if (cache.has(raw)) return cache.get(raw);

    const dest = options.createDest(raw, node);
    if (isObject(raw)) cache.set(raw, dest);
    if (isObject(dest) && isObject(raw)) {
      const prepared = Array.isArray(raw) ? raw.map(convert1) : mapValues(raw, convert1);
      needFilling.push({ dest, prepared, raw, node });
    }

    return dest;
  };

  const ans = convert1(entryRaw);
  while (needFilling.length) options.fillDest(needFilling.pop()!);

  return ans;
}
