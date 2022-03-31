import { isObject, mapValues } from './utils';
import { toRef, isDataNodeRef, $getDataNode, DataNodeRef, forEachDataNodeRef } from './DataNodeRef';
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
  /** for deeplyCloneAndNormalizeRefs. called when a reference is about to be used in new value */
  onRef?: (ref: DataNodeRef) => void;
}) => {
  const { beforeModify, onRef } = options;
  const DCANRoptions: Parameters<typeof deeplyCloneAndNormalizeRefs>[1] = {
    onRef,
  };

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

      value = deeplyCloneAndNormalizeRefs(value, DCANRoptions);
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
function deeplyCloneAndNormalizeRefs(x: any, options: { onRef?(ref: DataNodeRef): void } = {}): any {
  if (!isObject(x)) return x;

  const ref = toRef(x);
  if (ref) {
    options.onRef?.(ref);
    return ref;
  }

  warnIfNotPlainObject(x);
  return mapValues(x, sv => deeplyCloneAndNormalizeRefs(sv, options));
}

const getNOProxyFactoryOfNode = memoWithWeakMap((node: DataNode) => {
  return makeRefGuardProxyFactory({
    beforeModify(object, op, key) {
      node.owner.emit('beforeChange', { context: node.owner, node, object, op, key });
      forEachDataNodeRef((object as any)[key], ref => ref.unref(node));
    },
    onRef(ref) {
      ref.addRef(node);
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

      node.owner.emit('beforeChange', { context: node.owner, node, object: target, op: 'set', key });
      forEachDataNodeRef(target[key], ref => ref.unref(node));

      return Reflect.set(target, key, convertBeforeWriteRaw(node, value, key));
    },
    deleteProperty(target, key) {
      if (typeof key === 'symbol') throw new Error(`Do not use symbol property`);

      node.owner.emit('beforeChange', { context: node.owner, node, object: target, op: 'delete', key });
      forEachDataNodeRef(target[key], ref => ref.unref(node));

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
  if (!propSchema) {
    // no need to create another Node
    return deeplyCloneAndNormalizeRefs(value, {
      onRef: ref => ref.addRef(node),
    });
  }

  const ref = toRef(value);
  if (ref && ref.node.schema !== propSchema) throw new Error('Cannot refer Node whose schema mismatches');

  const finalRef = ref || node.owner.import(value, propSchema, importOptions).ref;
  finalRef.addRef(node);

  return finalRef;
}
