import { Schema, SchemaContext, SchemaDescriptor } from './schema';
import { mapValues } from 'lodash';
import { isObject } from './utils';
import { getNormalObjectProxy } from './normalObjectProxy';
import { toRef, isDataNodeRef, DataNodeRef, $getDataNode } from './DataNodeRef';
import { transformRaw } from './transformRaw';

export interface LinkedDataOptions {
  schemas?: Record<string, SchemaDescriptor | string> | SchemaContext;
}

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
   * @param value data to be imported
   * @param schema the schema name of current value
   * @returns
   */
  import<T = any>(value: T, schema?: string | Schema | null) {
    const actualSchema = this.schemas.get(schema);

    const existingNode = toRef(value)?.node;
    if (existingNode) {
      if (existingNode.schema !== actualSchema) throw new Error('Cannot import existing Node with different Schema');
      return existingNode as DataNode<T>; // TODO: support multiple owners
    }

    // the id from raw value, which might duplicate
    const presetId = actualSchema && actualSchema.type === 'object' && actualSchema.readKey(value);
    const id = this.allocateId(presetId ?? (actualSchema && actualSchema.$id));

    const node = new DataNode(this, id, actualSchema);
    this._nodes.set(id, node);
    node.setValue(value);
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

const enum DataNodeStatus {
  NOT_READY,
  FILLED_WITH_ANY,
  FILLED_WITH_REF,
  FILLED_WITH_OBJECT,
  FILLED_WITH_ARRAY,
}

const makeExport = (x: any): any => {
  if (typeof x !== 'object' || x === null) return x;
  if (isDataNodeRef(x)) return x.node.export();
  if (Array.isArray(x)) return x.map(makeExport);
  return Object.keys(x).reduce((acc, key) => {
    acc[key] = makeExport(x[key]);
    return acc;
  }, {} as any);
};

const isExporting = 0;
const exportingResults = new Map<DataNode, any>();

export class DataNode<T = any> {
  readonly id: string;
  readonly owner: LinkedData;
  readonly schema: Schema | null;

  status: DataNodeStatus = DataNodeStatus.NOT_READY;

  /**
   * the raw value, which might be a primitive, a `DataNodeRef` or a object containing `DataNodeRef` inside.
   *
   * this will NOT contain `DataNode` or Proxy from DataNode
   */
  _raw?: any;

  /** the proxy. exists when status is FILLED_WITH_OBJECT or FILLED_WITH_ARRAY */
  _proxy?: any;

  /** if you want to refer this node, use this anywhere you need */
  readonly ref: DataNodeRef;

  constructor(owner: LinkedData, id: string, schema: Schema | null) {
    this.owner = owner;
    this.id = id;
    this.schema = schema;
    this.ref = new DataNodeRef(this);
  }

  get [$getDataNode]() {
    return this;
  }

  /**
   * export a plain JSON object / array, which might contains circular reference.
   */
  export(): T {
    return transformRaw(this._raw, {
      createDest(raw) {
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
    if (this.status === DataNodeStatus.NOT_READY) throw new Error('Node is not filled');
    if (this.status === DataNodeStatus.FILLED_WITH_ANY) return this._raw;
    if (this.status === DataNodeStatus.FILLED_WITH_REF) return (this._raw as DataNodeRef).node.value;

    return this._proxy || (this._proxy = this._makeProxy());
  }

  set value(v: T) {
    this.setValue(v);
  }

  private _makeProxy() {
    return new Proxy(this._raw, {
      get: (target, key) => {
        if (key === $getDataNode) return this;

        const v = Reflect.get(target, key);
        if (!isObject(v)) return v;
        if (isDataNodeRef(v)) return v.node.value;
        return getNormalObjectProxy(v);
      },
      set: (target, key, value) => {
        const fieldSchema = this.schema?.get(key);
        if (fieldSchema) value = this.owner.import(value, fieldSchema);

        const ref = toRef(value);
        if (ref) value = ref; // TODO: schema constrain check?

        target[key] = value;
        return true;
      },
    });
  }

  setValue(value: T) {
    this._proxy = void 0;

    // if not object, just store as-is

    if (!isObject(value)) {
      this._raw = value;
      this.status = DataNodeStatus.FILLED_WITH_ANY;
      return;
    }

    // maybe is a DataNodeRef
    // TODO: add warn

    const ref = toRef(value);
    if (ref) {
      this._raw = ref;
      this.status = DataNodeStatus.FILLED_WITH_REF;
      return;
    }

    // not deeply process properties / items

    const owner = this.owner;
    const schema = this.schema;
    const processPropertyValueForRaw = (value: any, key: any) => {
      const ref = toRef(value);
      const propSchema = schema && schema.get(key);
      if (!propSchema) return ref || value; // no need to create

      if (ref && ref.node.schema !== propSchema) throw new Error('Cannot refer Node whose schema mismatches');
      return ref || owner.import(value, propSchema).ref;
    };

    if (Array.isArray(value)) {
      const newArr = schema ? value.map(processPropertyValueForRaw) : value.slice();
      this._raw = newArr;
      this.status = DataNodeStatus.FILLED_WITH_ARRAY;
      return;
    }

    const newArr = schema ? mapValues(value as Record<string, any>, processPropertyValueForRaw) : { ...value };
    this._raw = newArr;
    this.status = DataNodeStatus.FILLED_WITH_OBJECT;
  }
}