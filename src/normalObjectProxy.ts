import { isObject } from './utils';
import { isDataNodeRef, toRef } from './DataNodeRef';

/**
 * create a proxy factory, which can safely hide DataNodeRef from users
 *
 * - when read `DataNodeRef`, return the corresponding Node's proxy (`value`)
 * - when write ref / DataNode / proxy, always store a `DataNodeRef`
 *
 * this is the simplified scenario of `DataNode#makeProxy()` ignoring schema of `DataNode`
 */
export const makeRefGuardProxyFactory = () => {
  const toProxy = (obj: any) => {
    if (!isObject) return obj;
    if (cached.has(obj)) return cached.get(obj);

    const proxy = new Proxy(obj, proxyHandler);
    cached.set(obj, proxy);
    return proxy;
  };

  const proxyHandler: ProxyHandler<any> = {
    get(target, prop) {
      const value = Reflect.get(target, prop);
      if (isDataNodeRef(value)) return value.node.value;
      return value;
    },
    set(target, prop, value) {
      const ref = toRef(value);
      if (ref) {
        if (prop === 'length' && Array.isArray(target)) throw new Error("Cannot use DataNodeRef as array's length");
        value = ref;
      }

      return Reflect.set(target, prop, value);
    },
  };

  const cached = new WeakMap<any, any>();

  return { toProxy };
};

/**
 * create a proxy, which can safely hide DataNodeRef from users
 *
 * - when read `DataNodeRef`, return the corresponding Node's proxy (`value`)
 * - when write ref / DataNode / proxy, always store a `DataNodeRef`
 *
 * this is the simplified scenario of `DataNode#makeProxy()` ignoring schema of `DataNode`
 */
export const getNormalObjectProxy = makeRefGuardProxyFactory().toProxy;
