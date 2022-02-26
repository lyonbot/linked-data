import type { LinkedData, DataNode } from './LinkedData';
import type { DataNodeRef } from './DataNodeRef';
import { Path } from './types';
import { transformRaw } from './transformRaw';
import { shallowClone, toArray } from './utils';

/**
 * @public
 */
export interface DumpedNode {
  id: string;
  schemaId: string | null;
  raw: any;
  refs: {
    path: Path;
    targetNodeId: string;
  }[];
  referredBy: {
    sourceNodeId: string;
    path: Path;
  }[];
}

export interface JSONSafeData {
  raw: any;
  refs: {
    path: Path;
    targetNodeId: string;
  }[];
}

const refPlaceholderPrefix = '[[[ ref ]]]';

/**
 * dump nodes and related all nodes, into a JSON-safe data
 *
 * @public
 * @see {@link loadDataNodes}
 */
export function dumpDataNodes(
  node: DataNode | null | undefined | Iterable<DataNode | null | undefined>,
  options?: {
    writeKey?: boolean;
  },
) {
  const makeInfoWithoutRaw = (node: DataNode): DumpedNode => {
    const schemaId = node.schema?.$id || null;
    if (schemaId) schemasVisited.add(schemaId);

    return {
      id: node.id,
      schemaId,
      refs: [],
      referredBy: [],
      raw: null,
    };
  };

  const writeKey = options?.writeKey;

  const schemasVisited: Set<string> = new Set();
  const nodesToVisit: DataNode[] = toArray(node);
  const nodesVisited: Record<string, DumpedNode> = Object.create(null);

  nodesToVisit.forEach(node => {
    nodesVisited[node.id] = makeInfoWithoutRaw(node);
  });

  while (nodesToVisit.length) {
    const node = nodesToVisit.shift()!;
    const visitInfo = nodesVisited[node.id]!;

    const safe = toJsonSafeRaw(node.raw);
    visitInfo.raw = safe.raw;
    visitInfo.refs = safe.refs;
    safe.refs.forEach(({ path, targetNodeId: id }) => {
      const toNode = node.owner.getNode(id);
      if (!toNode) return;

      let targetNodeInfo = nodesVisited[toNode.id];
      if (!targetNodeInfo) {
        nodesVisited[toNode.id] = targetNodeInfo = makeInfoWithoutRaw(toNode);
        nodesToVisit.push(toNode);
      }
      targetNodeInfo.referredBy.push({ sourceNodeId: node.id, path });
    });

    if (writeKey && node.schema?.type === 'object') {
      node.schema.writeKey(visitInfo.raw, node.id);
    }
  }

  return {
    schemaIds: Array.from(schemasVisited),
    nodeInfos: nodesVisited,
  };
}

/**
 * original `node.raw` may contain DataNodeRef, it is not JSON-safe!
 *
 * use this to transform it into a safe JSON object, and then you can serialize or transfer it safely
 *
 * @public
 * @see {@link fromJsonSafeRaw}
 */
export function toJsonSafeRaw(raw: any): JSONSafeData {
  const answer: JSONSafeData = {
    raw: null,
    refs: [],
  };

  answer.raw = transformRaw(raw, {
    createDest(raw, toNode, path) {
      if (toNode) {
        answer.refs.push({ path, targetNodeId: toNode.id });
        return `${refPlaceholderPrefix} #${answer.refs.length - 1} -> ${toNode.id}`;
        // return transformRaw.final({ $type: 'ref', targetNodeId: toNode.id });
      }

      // now just normal object / array
      return shallowClone(raw);
    },
    fillDest({ dest, recipe }) {
      Object.assign(dest, recipe);
    },
  });

  return answer;
}

/**
 * load the {@link dumpDataNodes} dumped data, into a LinkedData.
 *
 * schemas shall be ready before calling this
 *
 * this will create some new nodes, based on your options
 *
 * @public
 * @see {@link dumpDataNodes}
 */
export function loadDataNodes(
  destination: LinkedData,
  data: Iterable<DumpedNode> | Record<string, DumpedNode>,
  options?: {
    overwrite?: boolean;
  },
): Record<string, DataNode> {
  const infoArr: DumpedNode[] =
    Symbol.iterator in data
      ? Array.from(data as Iterable<DumpedNode>) // array or set
      : Object.values(data);

  // ----------------------------------------------------------------

  const inflated: Record<string, DataNode> = Object.create(null);

  const overwrite = !!options?.overwrite;

  infoArr.forEach(nodeInfo => {
    inflated[nodeInfo.id] = destination.createVoidNode({
      id: nodeInfo.id,
      schema: nodeInfo.schemaId,
      overwrite,
    });
  });

  infoArr.forEach(nodeInfo => {
    inflated[nodeInfo.id].setValue(fromJsonSafeRaw(nodeInfo, id => inflated[id]!.ref));
  });

  return inflated;
}

/**
 * this is the reverse transform of {@link toJsonSafeRaw}
 *
 * @public
 * @see {@link toJsonSafeRaw}
 */
export function fromJsonSafeRaw(safe: JSONSafeData, inflateRef: (id: string) => DataNodeRef | null): any {
  const pendingLinks: Record<string, DataNodeRef | null> = {};
  safe.refs.forEach(({ path, targetNodeId }) => {
    pendingLinks[JSON.stringify(path)] = inflateRef(targetNodeId);
  });

  return transformRaw(safe.raw, {
    createDest(raw, _, path) {
      const toNodeRef =
        typeof raw === 'string' && // placeholder is always string
        raw.startsWith(refPlaceholderPrefix) &&
        pendingLinks[JSON.stringify(path)];

      if (toNodeRef) {
        // make a link to something else
        return transformRaw.final(toNodeRef);
      }

      // now just normal object / array
      return shallowClone(raw);
    },
    fillDest: ({ dest, recipe }) => {
      Object.assign(dest, recipe);
    },
  });
}
