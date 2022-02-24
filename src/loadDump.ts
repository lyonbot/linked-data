import type { LinkedData, DataNode } from './LinkedData';
import { transformRaw } from './transformRaw';

export interface DumpedNode {
  id: string;
  schemaId: string | null;
  raw: any;
  refs: {
    path: (string | number)[];
    targetNodeId: string;
  }[];
  referredBy: {
    sourceNodeId: string;
    path: (string | number)[];
  }[];
}

const refPlaceholderPrefix = '[[[ ref ]]]';

export function dumpDataNodes(
  node: DataNode,
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
  const nodesToVisit: DataNode[] = [];
  const nodesVisited: Record<string, DumpedNode> = Object.create(null);

  nodesToVisit.push(node);
  nodesVisited[node.id] = makeInfoWithoutRaw(node);

  while (nodesToVisit.length) {
    const node = nodesToVisit.shift()!;
    const visitInfo = nodesVisited[node.id]!;

    visitInfo.raw = transformRaw(node.raw, {
      createDest(raw, toNode, path) {
        if (toNode) {
          let targetNodeInfo = nodesVisited[toNode.id];
          if (!targetNodeInfo) {
            nodesVisited[toNode.id] = targetNodeInfo = makeInfoWithoutRaw(toNode);
            nodesToVisit.push(toNode);
          }

          visitInfo.refs.push({ path, targetNodeId: toNode.id });
          targetNodeInfo.referredBy.push({ sourceNodeId: node.id, path });

          return `${refPlaceholderPrefix} #${visitInfo.refs.length - 1} -> ${toNode.id}`;
          // return transformRaw.final({ $type: 'ref', targetNodeId: toNode.id });
        }

        // now just normal object / array
        if (typeof raw !== 'object' || raw === null) return raw;
        if (Array.isArray(raw)) return new Array(raw.length);
        return {};
      },
      fillDest({ dest, recipe }) {
        Object.assign(dest, recipe);
      },
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

export function loadDataNodes(
  destination: LinkedData,
  nodeInfos: Iterable<DumpedNode> | Record<string, DumpedNode>,
): Record<string, DataNode> {
  const infoArr: DumpedNode[] =
    Symbol.iterator in nodeInfos
      ? Array.from(nodeInfos as Iterable<DumpedNode>) // array or set
      : Object.values(nodeInfos);

  // ----------------------------------------------------------------

  const inflated: Record<string, DataNode> = Object.create(null);

  infoArr.forEach(nodeInfo => {
    inflated[nodeInfo.id] = destination.createVoidNode({
      id: nodeInfo.id,
      schema: nodeInfo.schemaId,
    });
  });

  infoArr.forEach(nodeInfo => {
    const pendingLinks: Record<string, DataNode> = {};
    nodeInfo.refs.forEach(({ path, targetNodeId }) => {
      pendingLinks[JSON.stringify(path)] = inflated[targetNodeId]!;
    });

    inflated[nodeInfo.id].setValue(
      transformRaw(nodeInfo.raw, {
        createDest(raw, _, path) {
          {
            const toNode =
              typeof raw === 'string' && // placeholder is always string
              raw.startsWith(refPlaceholderPrefix) &&
              pendingLinks[JSON.stringify(path)];

            if (toNode) {
              // make a link to something else
              return transformRaw.final(toNode.ref);
            }
          }

          // now just normal object / array
          if (typeof raw !== 'object' || raw === null) return raw;
          if (Array.isArray(raw)) return new Array(raw.length);
          return {};
        },
        fillDest: ({ dest, recipe }) => {
          Object.assign(dest, recipe);
        },
      }),
    );
  });

  return inflated;
}
