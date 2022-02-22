import { isObject } from './utils';
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
    if (!result) throw new Error(BROKEN_REF_ERROR)
    return result;
  }
}

/**
 * @public
 */
export const isDataNodeRef = (value: any): value is DataNodeRef => value instanceof DataNodeRef;

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
