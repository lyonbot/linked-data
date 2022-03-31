import { forEach, isObject } from './utils';
import type { DataNode, LinkedData } from './LinkedData';
import { BROKEN_REF_ERROR } from './warnings';

/**
 * a placeholder for a reference to a DataNode
 *
 * @public
 */
export class DataNodeRef {
  constructor(public owner: LinkedData, public id: string) {}

  get node() {
    const result = this.owner.getNode(this.id);
    if (!result) throw new Error(BROKEN_REF_ERROR);
    return result;
  }

  addRef(fromNode: DataNode) {
    const toNode = this.node;

    const counter = (toNode.referedBy.get(fromNode) || 0) + 1;
    toNode.referedBy.set(fromNode, counter);
    fromNode.refering.set(toNode, counter);
  }

  unref(fromNode: DataNode) {
    const toNode = this.node;

    const counter = (toNode.referedBy.get(fromNode) || 0) - 1;
    if (counter > 0) {
      toNode.referedBy.set(fromNode, counter);
      fromNode.refering.set(toNode, counter);
    } else {
      toNode.referedBy.delete(fromNode);
      fromNode.refering.delete(toNode);
    }
  }
}

/**
 * @public
 */
export const isDataNodeRef = (value: any): value is DataNodeRef => value instanceof DataNodeRef;

/**
 * @public
 * @param value
 * @param iterator
 */
export const forEachDataNodeRef = (
  value: any,
  iterator: (ref: DataNodeRef, path: any[]) => void,
  pathPrefix: any[] = [],
) => {
  if (!isObject(value)) return;
  if (isDataNodeRef(value)) {
    iterator(value, pathPrefix);
    return;
  }

  forEach(value, (subValue, key) => forEachDataNodeRef(subValue, iterator, [...pathPrefix, key]));
};

/**
 * @internal
 */
export const $getDataNode = Symbol('$getDataNode');

/**
 * if value is a DataNodeRef, or a DataNode, or a Proxy to DataNode, return the DataNodeRef.
 * otherwise, return undefined.
 *
 * @public
 */
export function toRef(value: any): DataNodeRef | undefined {
  if (!isObject(value)) return;
  if (isDataNodeRef(value)) return value;

  const implicitNode = value[$getDataNode] as DataNode | undefined;
  if (implicitNode) return implicitNode.ref;
}
