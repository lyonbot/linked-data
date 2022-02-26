import { isObject, mapValues } from './utils';
import { toRef, isDataNodeRef, $getDataNode } from './DataNodeRef';
import { warnIfNotPlainObject } from './warnings';
import { memoWithWeakMap } from './utils/memoWithWeakMap';
import type { DataNode, LinkedDataImportOptions } from './LinkedData';
import type { AnyObject } from './types';

/**
 * create a proxy factory, which can safely hide DataNodeRef from users
 *
 * - when read `DataNodeRef`, return the corresponding Node's proxy (`value`)
 * - when write ref / DataNode / proxy, always store a `DataNodeRef`
 *
 * this is the simplified scenario of `DataNode#makeProxy()` ignoring schema of `DataNode`
 */
const makeRefGuardProxyFactory = (options: {
  /** callback when modified, including set and deleteProperty */
  beforeModify?: (target: AnyObject, op: 'set' | 'delete', key: string | number) => void;
}) => {
  const { beforeModify } = options;

  const toProxy = (obj: any) => {
    if (!isObject(obj)) return obj;
    if (cached.has(obj)) return cached.get(obj);

    const proxy = new Proxy(obj, proxyHandler);
    cached.set(obj, proxy);
    return proxy;
  };

  const proxyHandler: ProxyHandler<any> = {
    get(target, prop) {
      const value = Reflect.get(target, prop);
      if (isDataNodeRef(value)) return value.node.value;
      return toProxy(value);
    },
    set(target, key, value) {
      if (typeof key === 'symbol') throw new Error(`Do not use symbol property`);

      value = deeplyCloneAndNormalizeRefs(value);
      if (isDataNodeRef(value)) {
        if (key === 'length' && Array.isArray(target)) throw new Error("Cannot use DataNodeRef as array's length");
      }

      beforeModify && beforeModify(target, 'set', key);
      return Reflect.set(target, key, value);
    },
    deleteProperty(target, key) {
      if (typeof key === 'symbol') throw new Error(`Do not use symbol property`);
      beforeModify && beforeModify(target, 'delete', key);
      return Reflect.deleteProperty(target, key);
    },
  };

  const cached = new WeakMap<any, any>();

  return { toProxy };
};

/**
 * deep clone a value, transform all `DataNodeRef`, `DataNode` and Proxy to `DataNodeRef`
 *
 * @internal
 */
function deeplyCloneAndNormalizeRefs(x: any) {
  if (!isObject(x)) return x;

  const ref = toRef(x);
  if (ref) return ref;

  warnIfNotPlainObject(x);
  return mapValues(x, deeplyCloneAndNormalizeRefs);
}

const getNOProxyFactoryOfNode = memoWithWeakMap((node: DataNode) => {
  return makeRefGuardProxyFactory({
    beforeModify(target, op, key) {
      node.owner.emit('beforeChange', { context: node.owner, node, target, op, key });
    },
  });
});

export function makeProxyForNode(node: DataNode) {
  const normalObjectProxyFactory = getNOProxyFactoryOfNode(node);
  return new Proxy(node.raw, {
    get: (target, key) => {
      if (key === $getDataNode) return node;

      const v = Reflect.get(target, key);
      if (!isObject(v)) return v;
      if (isDataNodeRef(v)) return v.node?.value;
      return normalObjectProxyFactory.toProxy(v);
    },
    set(target, key, value) {
      /* istanbul ignore next */
      if (typeof key === 'symbol') throw new Error(`Do not use symbol property`);

      node.owner.emit('beforeChange', { context: node.owner, node, target, op: 'set', key });
      return Reflect.set(target, key, convertBeforeWriteRaw(node, value, key));
    },
    deleteProperty(target, key) {
      if (typeof key === 'symbol') throw new Error(`Do not use symbol property`);

      node.owner.emit('beforeChange', { context: node.owner, node, target, op: 'delete', key });
      return Reflect.deleteProperty(target, key);
    },
  });
}

export function convertBeforeWriteRaw(
  node: DataNode,
  value: any,
  key: any,
  importOptions?: LinkedDataImportOptions,
): any {
  const propSchema = node.schema?.get(key);
  if (!propSchema) return deeplyCloneAndNormalizeRefs(value); // no need to create another Node

  const ref = toRef(value);
  if (ref && ref.node.schema !== propSchema) throw new Error('Cannot refer Node whose schema mismatches');

  return ref || node.owner.import(value, propSchema, importOptions).ref;
}
