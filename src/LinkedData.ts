import { Schema, SchemaContext, SchemaDescriptor } from './schema';
import { isObject, mapValues } from './utils';
import { getNormalObjectProxy } from './normalObjectProxy';
import { toRef, isDataNodeRef, DataNodeRef, $getDataNode } from './DataNodeRef';
import { transformRaw } from './transformRaw';
import { VOID_NODE_ERROR, warnIfNotPlainObject } from './warnings';

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

/**
 * All you need is this node manager.
 *
 * @public
 */
export class LinkedData {
  schemas: SchemaContext;
  _nodes: Map<string, DataNode> = new Map();

  constructor(options: LinkedDataOptions) {
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
    let id = presetId !== void 0 ? String(presetId) : '';

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

      if (overwrite === 'never') id = '';
    }

    if (!id) id = this.allocateId(presetId ?? (actualSchema && actualSchema.$id));

    const node = new DataNode(this, id, actualSchema);
    this._nodes.set(id, node);
    node.setValue(value, options);
    return node as DataNode<T>;
  }

  createVoidNode<T = any>(options: { id?: string; schema?: string | Schema | null }) {
    const actualSchema = this.schemas.get(options.schema);
    const id = this.allocateId(options.id ?? (actualSchema && actualSchema.$id));

    const node = new DataNode(this, id, actualSchema);
    this._nodes.set(id, node);
    return node as DataNode<T>;
  }

  getNode(id: string) {
    return this._nodes.get(id);
  }

  allocateId(_ref?: any) {
    const prefix = (typeof _ref === 'string' ? _ref : typeof _ref === 'number' ? String(_ref) : null) || '_node';

    let currentId = prefix;
    for (let index = 1; this._nodes.has(currentId); index++, currentId = prefix + index);
    return currentId;
  }

  prune(preservingNodes?: (string | DataNode)[]) {
    // TODO
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

  /**
   * @internal
   */
  get [$getDataNode]() {
    return this;
  }

  /**
   * export a plain JSON object / array, which might contains circular reference.
   */
  export(): T {
    return transformRaw(this.raw, {
      createDest(raw, node) {
        if (node && node.status === DataNodeStatus.VOID) {
          throw new Error(VOID_NODE_ERROR);
        }

        if (!isObject(raw)) return raw;
        if (Array.isArray(raw)) return new Array(raw.length);
        return {};
      },
      fillDest({ dest, prepared }) {
        Object.assign(dest, prepared);
      },
    });
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
      return;
    }

    // now `value` is an object / array
    // deeply process properties / items

    warnIfNotPlainObject(value);

    this.status = Array.isArray(value) ? DataNodeStatus.FILLED_WITH_ARRAY : DataNodeStatus.FILLED_WITH_OBJECT;
    this.raw = mapValues(value, (v, k) => convertBeforeWriteField(this, v, k, importOptions));
  }

  /**
   * clear node value and set status to void
   */
  setVoid() {
    this.setValue($SET_TO_VOID as any);
  }
}

/**
 * deep clone a value, transform all `DataNodeRef`, `DataNode` and Proxy to `DataNodeRef`
 *
 * @internal
 */
export function deeplyCloneAndNormalizeRefs(x: any) {
  if (!isObject(x)) return x;

  const ref = toRef(x);
  if (ref) return ref;

  warnIfNotPlainObject(x);
  return mapValues(x, deeplyCloneAndNormalizeRefs);
}

function makeProxyForNode(node: DataNode) {
  return new Proxy(node.raw, {
    get: (target, key) => {
      if (key === $getDataNode) return node;

      const v = Reflect.get(target, key);
      if (!isObject(v)) return v;
      if (isDataNodeRef(v)) return v.node?.value;
      return getNormalObjectProxy(v);
    },
    set: (target, key, value) => {
      /* istanbul ignore next */
      if (typeof key === 'symbol') throw new Error(`Do not use symbol property`);

      target[key] = convertBeforeWriteField(node, value, key);
      return true;
    },
  });
}

function convertBeforeWriteField(node: DataNode, value: any, key: any, importOptions?: LinkedDataImportOptions): any {
  const propSchema = node.schema?.get(key);
  if (!propSchema) return deeplyCloneAndNormalizeRefs(value); // no need to create another Node

  const ref = toRef(value);
  if (ref && ref.node.schema !== propSchema) throw new Error('Cannot refer Node whose schema mismatches');

  return ref || node.owner.import(value, propSchema, importOptions).ref;
}
