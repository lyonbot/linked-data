import { Schema, SchemaContext, SchemaDescriptor } from './schema';
import { isObject, mapValues, shallowClone } from './utils';
import { toRef, DataNodeRef, $getDataNode, forEachDataNodeRef } from './DataNodeRef';
import { transformRaw } from './transformRaw';
import { VOID_NODE_ERROR, warnIfNotPlainObject } from './warnings';
import { EventEmitter } from './EventEmitter';
import { makeProxyForNode, convertBeforeWriteRaw } from './proxy';
import { AnyObject } from './types';

/**
 * @public
 */
export interface LinkedDataOptions {
  schemas?: Record<string, SchemaDescriptor | string> | SchemaContext;
}

/**
 * @public
 */
export interface LinkedDataImportOptions {
  /**
   * while importing, if source data indicated a id, but it is taken by a existing DataNode, shall we rewrite it?
   *
   * - `never` - (default) do not overwrite. a new id will be generated.
   * - `same-schema` - overwrite if the source data has the same schema, otherwise make a new id.
   * - `always` - (dangerous) always overwrite regardless of the source data's schema
   * - a function to decide whether to overwrite. if return `false`, a new id will be generated.
   */
  overwrite?: 'same-schema' | 'always' | 'never' | ((data: any, existingNode: DataNode, schema: Schema) => boolean);
}

/** @public */
export interface LinkedDataEvents {
  /** trigger before a node's value or object inside it, is getting changed */
  beforeChange(ev: {
    context: LinkedData;
    node: DataNode;
    object: AnyObject | '<root>';
    op: 'set' | 'delete';
    key?: string | number; // unavailable when whole `<root>` is getting `set`-ed
  }): any;
}

/**
 * All you need is this node manager.
 *
 * @public
 */
export class LinkedData extends EventEmitter<LinkedDataEvents> {
  schemas: SchemaContext;
  _nodes: Map<string, DataNode> = new Map();

  constructor(options: LinkedDataOptions) {
    super();
    const schemas = options.schemas;
    this.schemas = schemas && schemas instanceof SchemaContext ? schemas : new SchemaContext(schemas);
  }

  /**
   * create a DataNode from JSON value.
   *
   * the `value` can NOT be circular!
   *
   * @public
   * @param value - data to be imported
   * @param schema - the schema name of current value
   * @returns
   */
  import<T = any>(value: T, schema?: string | Schema | null, options?: LinkedDataImportOptions) {
    const actualSchema = this.schemas.get(schema);

    const existingNode = toRef(value)?.node;
    if (existingNode) {
      if (existingNode.schema !== actualSchema) throw new Error('Cannot import existing Node with different Schema');
      return existingNode as DataNode<T>; // TODO: support multiple owners
    }

    // the id from raw value, which might duplicate
    const presetId = actualSchema && actualSchema.type === 'object' && actualSchema.readKey(value);
    const id = presetId && presetId !== 0 ? String(presetId) : '';
    let actualOverwrite = false;

    const sameIdNode = id && this._nodes.get(id);
    if (sameIdNode) {
      let overwrite = options?.overwrite || 'never';

      if (overwrite === 'same-schema') {
        overwrite = sameIdNode.schema === actualSchema ? 'always' : 'never';
      }

      if (typeof overwrite === 'function') {
        // sameIdNode is not-falsy, implicitly means actualSchema is not-falsy
        overwrite = overwrite(value, sameIdNode, actualSchema!) ? 'always' : 'never';
      }

      actualOverwrite = overwrite === 'always';
    }

    const node = this.createVoidNode({
      id,
      schema: actualSchema,
      overwrite: actualOverwrite,
    });
    node.setValue(value, options);
    return node as DataNode<T>;
  }

  createVoidNode<T = any>(options: {
    id?: string;
    schema?: string | Schema | null;
    /**
     * optional
     *
     * if `true` and `id` is not empty, the id will be used as-is and if the id is taken, original DataNode will be replaced
     */
    overwrite?: boolean;
  }) {
    const actualSchema = this.schemas.get(options.schema);

    let id: string;
    const actualOverwrite = !!(typeof options.id === 'string' && options.id !== '' && options.overwrite);

    if (actualOverwrite) id = options.id!;
    else id = this.allocateId(options.id ?? (actualSchema && actualSchema.$id));

    // const lastNode = actualOverwrite && this._nodes.get(id);
    // if (lastNode) {
    // }

    const node = new DataNode(this, id, actualSchema);
    this._nodes.set(id, node);
    return node as DataNode<T>;
  }

  getNode(id: string) {
    return this._nodes.get(id);
  }

  allocateId(_ref?: any) {
    const ref = (typeof _ref === 'string' ? _ref : typeof _ref === 'number' ? String(_ref) : null) || '_node';
    if (ref && !this._nodes.has(ref)) return ref;

    let newId: string;
    const [, prefix, nonce] = ref.match(/^(.+)\.([a-z0-9]+)$/) || [null, ref, '0'];
    for (let i = parseInt(nonce!, 36) + 1; this._nodes.has((newId = prefix + '.' + i.toString(36))); i++);
    return newId;
  }
}

/**
 * @public
 */
export const enum DataNodeStatus {
  VOID,
  FILLED_WITH_ANY,
  FILLED_WITH_REF,
  FILLED_WITH_OBJECT,
  FILLED_WITH_ARRAY,
}

const $SET_TO_VOID = Symbol('$SET_TO_VOID');

/**
 * @public
 */
export class DataNode<T = any> {
  readonly id: string;
  readonly owner: LinkedData;
  readonly schema: Schema | null;

  status: DataNodeStatus = DataNodeStatus.VOID;

  /**
   * the raw value, which might be a primitive, a `DataNodeRef` or a object containing `DataNodeRef` inside.
   *
   * this will NOT contain `DataNode` or Proxy from DataNode
   */
  raw?: any;

  /** the proxy. exists when status is FILLED_WITH_OBJECT or FILLED_WITH_ARRAY */
  _proxy?: any;

  /** if you want to refer this node, use this anywhere you need */
  readonly ref: DataNodeRef;

  constructor(owner: LinkedData, id: string, schema: Schema | null) {
    this.owner = owner;
    this.id = id;
    this.schema = schema;
    this.ref = new DataNodeRef(owner, id);
  }

  /** this node is directly refered by what nodes */
  referedBy = new Map<DataNode, number>();

  /** this node is directly refering what nodes */
  refering = new Map<DataNode, number>();

  /**
   * @internal
   */
  get [$getDataNode]() {
    return this;
  }

  /**
   * export a plain JSON object / array, which might contains circular reference.
   */
  export(options?: {
    /**
     * optional, default: false
     *
     * if true, the output objects will have extra `_id` (or other name depend on schema) property
     */
    writeKey?: boolean | ((node: DataNode) => boolean);
  }): T {
    const writeKey = options && options.writeKey;

    return transformRaw(this.ref, {
      createDest(raw, node) {
        if (node && node.status === DataNodeStatus.VOID) {
          throw new Error(VOID_NODE_ERROR);
        }

        return shallowClone(raw);
      },
      fillDest({ dest, recipe, node }) {
        Object.assign(dest, recipe);

        if (
          node &&
          node.schema &&
          node.schema.type === 'object' &&
          writeKey &&
          (typeof writeKey !== 'function' || writeKey(node))
        ) {
          node.schema.writeKey(dest, node.id);
        }
      },
    });
  }

  /**
   * iterate and visit every node.
   */
  iterate(visitor: (node: DataNode, path: (string | number)[]) => void | 'abort' | 'skip') {
    const $abort = Symbol('abort');
    try {
      transformRaw(this.ref, {
        createDest(raw, node, path) {
          if (!node) return raw;

          const ans = visitor(node, path);

          if (ans === 'abort') throw $abort;
          if (ans === 'skip') return transformRaw.final(null);

          return raw;
        },
        fillDest: () => void 0,
      });
    } catch (e) {
      if (e !== $abort) throw e;
    }
  }

  /**
   * the proxied current value. you can mutate it directly.
   */
  get value(): T {
    if (this.status === DataNodeStatus.VOID) throw new Error(VOID_NODE_ERROR);
    if (this.status === DataNodeStatus.FILLED_WITH_ANY) return this.raw;
    if (this.status === DataNodeStatus.FILLED_WITH_REF) return (this.raw as DataNodeRef).node.value;

    return this._proxy || (this._proxy = makeProxyForNode(this));
  }

  set value(v: T) {
    this.setValue(v);
  }

  /**
   * set the value
   *
   * @param importOptions - optional, see LinkedData.import
   */
  setValue(value: T, importOptions: LinkedDataImportOptions = {}) {
    this._proxy = void 0;
    this.owner.emit('beforeChange', {
      context: this.owner,
      node: this,
      object: '<root>',
      op: 'set',
    });

    forEachDataNodeRef(this.raw, ref => ref.unref(this));

    // special mark
    if ((value as unknown) === $SET_TO_VOID) {
      this.raw = void 0;
      this.status = DataNodeStatus.VOID;
      return;
    }

    // if not object, just store as-is

    if (!isObject(value)) {
      this.raw = value;
      this.status = DataNodeStatus.FILLED_WITH_ANY;
      return;
    }

    // maybe is a DataNodeRef
    // TODO: add warn

    const ref = toRef(value);
    if (ref) {
      this.raw = ref;
      this.status = DataNodeStatus.FILLED_WITH_REF;
      ref.addRef(this);
      return;
    }

    // now `value` is an object / array
    // deeply process properties / items

    warnIfNotPlainObject(value);

    this.status = Array.isArray(value) ? DataNodeStatus.FILLED_WITH_ARRAY : DataNodeStatus.FILLED_WITH_OBJECT;
    this.raw = mapValues(value, (v, k) => convertBeforeWriteRaw(this, v, k, importOptions));
  }

  /**
   * clear node value and set status to void
   */
  setVoid() {
    this.setValue($SET_TO_VOID as any);
  }
}
