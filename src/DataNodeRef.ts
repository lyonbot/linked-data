import { isObject } from './utils';
import type { DataNode } from './LinkedData';

export class DataNodeRef {
  constructor(public node: DataNode) {}
}

export const isDataNodeRef = (value: any): value is DataNodeRef => value instanceof DataNodeRef;
export const $getDataNode = Symbol('$getDataNode');

/**
 * if value is a DataNodeRef, or a DataNode, or a Proxy to DataNode, return the DataNodeRef.
 * otherwise, return undefined.
 */
export function toRef(value: any): DataNodeRef | undefined {
  if (!isObject(value)) return;
  if (isDataNodeRef(value)) return value;

  const implicitNode = value[$getDataNode] as DataNode | undefined;
  if (implicitNode) return implicitNode.ref;
}
