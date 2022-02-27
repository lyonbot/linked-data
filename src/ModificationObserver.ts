import { isDataNodeRef } from './DataNodeRef';
import { getPatches } from './getPatches';
import { mapValues, shallowClone } from './utils';
import { DataNodeStatus } from './LinkedData';
import type { DataNode, LinkedData, LinkedDataEvents } from './LinkedData';
import type { AnyObject, PatchOp } from './types';
import { toJsonSafeRaw } from './loadDump'; // eslint-disable-line @typescript-eslint/no-unused-vars

type EmptyFunction = (fn: () => void) => void;
declare const setImmediate: ((fn: EmptyFunction) => any) | undefined;
const nextTick = typeof setImmediate !== 'undefined' ? setImmediate : (fn: EmptyFunction) => setTimeout(fn, 0);

const $root = {};

type ModificationObserverCallback = (observer: ModificationObserver) => any;

/**
 * a record contains some changes to a certain DataNode.
 *
 * you can retrieve some records by calling `takeRecords()` of {@link ModificationObserver}
 *
 * @public
 * @example
 * ```js
 * // undo:
 * record.node.value = applyPatches(record.node.value, record.revertPatches)
 *
 * // redo:
 * record.node.value = applyPatches(record.node.value, record.patches)
 * ```
 *
 * @see {@link ModificationObserver}
 */
export interface ModificationRecord {
  /**
   * which node is edited.
   */
  node: DataNode;

  /**
   * whether this node is newly created while this observing duration.
   */
  isNewNode?: boolean;

  /**
   *
   * **Note**:
   * This data is not JSON-safe! It may has DataNodeRef.
   * You might need {@link toJsonSafeRaw} before storage this info
   */
  patches: PatchOp[];

  /**
   *
   * **Note**:
   * This data is not JSON-safe! It may has DataNodeRef.
   * You might need {@link toJsonSafeRaw} before storage this info
   */
  revertPatches: PatchOp[];
}

interface ObCfg {
  onlyNodes?: Set<DataNode>;
}

function cloneDeepIgnoreRef(x: any) {
  if (typeof x !== 'object' || x === null) return x;
  if (isDataNodeRef(x)) return x;
  const ans = mapValues(x, v => cloneDeepIgnoreRef(v));
  return ans;
}

/**
 * @public
 */
export class ModificationObserver {
  //  DataNode -> RawObject -> shallowCloneSnapshot
  private _changed = new Map<DataNode, WeakMap<AnyObject, AnyObject>>();
  private _newNodes = new Set<DataNode>();
  private _callback: ModificationObserverCallback;
  private _observingContexts = new Map<LinkedData, ObCfg>();

  constructor(callback: ModificationObserverCallback) {
    this._callback = callback;
  }

  disconnect() {
    this.clearBuffer();
    this._observingContexts.forEach((_, key) => key.off('beforeChange', this._handleBeforeChange));
    this._observingContexts.clear();
  }

  private _addContext(ld: LinkedData, cfg: ObCfg) {
    if (!this._observingContexts.has(ld)) {
      ld.on('beforeChange', this._handleBeforeChange);
    }
    this._observingContexts.set(ld, cfg);
  }

  observeLinkedData(ld: LinkedData | null | undefined): this {
    if (!ld) return this;

    this._addContext(ld, {});
    return this;
  }

  observeNode(node: DataNode | null | undefined): this {
    if (!node) return this;
    const lastCfg = this._observingContexts.get(node.owner) || { onlyNodes: new Set() };
    if (lastCfg.onlyNodes) lastCfg.onlyNodes.add(node);

    this._addContext(node.owner, lastCfg);
    return this;
  }

  /**
   * get all changes since last record-taking, or the first observing
   *
   * @param keepBuffer - this function will call `clearBuffer` implicitly. to avoid it, set this to true
   */
  takeRecords(keepBuffer?: boolean): ModificationRecord[] {
    const changed = this._changed;
    const records = Array.from(changed).map(([node, mapping]): ModificationRecord => {
      const raw = node.raw;
      return {
        node,
        isNewNode: this._newNodes.has(node),
        ...getPatches({
          root: raw,
          oldRoot: mapping.has($root) ? mapping.get($root) : raw,
          getOld: o => mapping.get(o),
          processPatchValues: cloneDeepIgnoreRef,
        }),
      };
    });

    if (keepBuffer !== true) this.clearBuffer();

    return records;
  }

  clearBuffer() {
    this._newNodes.clear();
    this._changed.clear();
  }

  private _queued = false;
  private _handleBeforeChange: LinkedDataEvents['beforeChange'] = ev => {
    const { context, node, object: target } = ev;

    // ------------------------
    // ignore some nodes

    const ctxCfg = this._observingContexts.get(context);
    if (!ctxCfg) return;
    if (ctxCfg.onlyNodes && !ctxCfg.onlyNodes.has(node)) return;

    // ------------------------
    // if this is the first time we modify value
    // take a snapshot (shallow clone)

    const changed = this._changed;
    let map1 = changed.get(node);
    if (!map1) changed.set(node, (map1 = new WeakMap()));

    if (target === '<root>') {
      if (node.status === DataNodeStatus.VOID) this._newNodes.add(node);
      if (!map1.has($root)) map1.set($root, isDataNodeRef(node.raw) ? node.raw : shallowClone(node.raw));
    } else {
      if (!map1.has(target)) map1.set(target, shallowClone(target));
    }

    // ------------------------
    // queue a macro-task for callback

    if (!this._queued) {
      this._queued = true;
      nextTick(() => {
        this._queued = false;
        this._callback(this);
      });
    }
  };
}
