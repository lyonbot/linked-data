import { DataNode } from '@lyonbot/linked-data';
import { useEffect } from 'react/hooks';
import { useForceUpdate } from './useForceUpdate';

/**
 * watch a node's change
 */
export function useDataNode(node: DataNode): void {
  const forceUpdate = useForceUpdate();
  useEffect(() => {
    return node.owner.subscribe('beforeChange', event => {
      if (node === event.node) forceUpdate();
    });
  }, [node]);
}
