import type { DataNode } from '../LinkedData';

export function directRefCount(fromNode: DataNode, toNode: DataNode) {
  const counter = fromNode.refering.get(toNode) || 0;
  expect(toNode.referedBy.get(fromNode) || 0).toBe(counter);

  return counter;
}
