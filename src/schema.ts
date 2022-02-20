import { isObject, makeDataClass, makeGetterFromDictionary } from './utils';
import defineLazyGetter from './utils/lazyGetter';

export type SchemaDescriptor = ObjectSchemaDescriptor | ArraySchemaDescriptor;

export interface ObjectSchemaDescriptor {
  type: 'object';
  properties: Record<string, string | SchemaDescriptor>;

  /**
   * optional, default is `_id`
   *
   * - when importing, if the origin data has `_id` property, it will be used as the Node's id
   * - when exporting, the output JSON object will have a `_id` property
   *
   * no need to define it in `properties`
   */
  key?:
    | string
    | {
        import: string | ((raw: any) => any);
        export: string | ((dest: any, key: string) => void);
      };
}

export interface ArraySchemaDescriptor {
  type: 'array';
  items: string | SchemaDescriptor;
}

export class SchemaContext {
  private _dict: Record<string, Schema | string> = Object.create(null);
  private _sdMap: Map<SchemaDescriptor, Schema> = new Map();
  private _anon: Set<Schema> = new Set();

  constructor(schemas: Record<string, SchemaDescriptor | string> = {}) {
    Object.keys(schemas).forEach(key => {
      this.register(key, schemas[key]);
    });
  }

  register(id: string, x: SchemaDescriptor | string) {
    if (typeof x === 'string') {
      this._dict[id] = x;
      return;
    }

    const schema = x.type === 'object' ? new ObjectSchema(this, id, x) : new ArraySchema(this, id, x);
    this._sdMap.set(x, schema);
    this._dict[id] = schema;

    return schema;
  }

  get(
    x: string[] | string | SchemaDescriptor | Schema | null | undefined,
    via?: Schema,
    viaKey?: string | number,
  ): Schema | null {
    // first process #/
    // maybe is a path "#/Schema1/foo/bar"

    if (typeof x === 'string') {
      if (x.startsWith('#/')) {
        const parts = x.slice(2).split('/');
        return this.get(parts);
      }
    }

    // resolve alias (in _dict, value can be string)

    while (x && typeof x === 'string') x = this._dict[x];
    if (!x || typeof x === 'string') return null;

    if (Array.isArray(x)) {
      if (!x[0]) return null;
      return x.slice(1).reduce((p, c) => p && p.get(c), this.get(x[0]));
    }

    if ('$context' in x) return x; // already a Schema instance, just return

    const key = this._sdMap.get(x);
    if (key) return key;

    // for anonymous schema, when we first encounter it, it is not in `_sdMap`
    // we need to create a new Schema instance and give it a path-like id

    let tempId = `${via!.$id}/${viaKey!}`;
    if (!tempId.startsWith('#/')) tempId = `#/${tempId}`;
    const s = this.register(tempId, x)!;
    this._anon.add(s);
    return s;
  }
}

export type Schema = ObjectSchema | ArraySchema;

export class ObjectSchema extends makeDataClass<Required<ObjectSchemaDescriptor>>() {
  private _cachedProperties!: ObjectSchemaDescriptor['properties'];
  private _getProperty!: (i: any) => string | SchemaDescriptor | undefined;

  readonly $context: SchemaContext;
  readonly $id: string;

  constructor($context: SchemaContext, $id: string, input: ObjectSchemaDescriptor) {
    super({ key: '_id', ...input });
    this.$context = $context;
    this.$id = $id;

    this.setProperties(this.properties);
    Object.defineProperty(this, 'properties', {
      enumerable: true,
      configurable: true,
      get: () => this._cachedProperties,
      set: x => this.setProperties(x),
    });
  }

  addProperties(properties: ObjectSchemaDescriptor['properties']): void {
    this.setProperties({ ...this._cachedProperties, ...properties });
  }

  removeProperties(keys: string[]): void {
    const properties = { ...this._cachedProperties };
    keys.forEach(key => delete properties[key]);
    this.setProperties(properties);
  }

  setProperties(properties: ObjectSchemaDescriptor['properties']): void {
    this._cachedProperties = Object.freeze({ ...properties });
    this._getProperty = makeGetterFromDictionary(this._cachedProperties);
  }

  /**
   * get property schema
   *
   * @param key can be a string, number or string[]
   * @returns Schema
   */
  get(key: null | undefined | string | number | (string | number)[]): Schema | null {
    if (key == null) return null;
    if (Array.isArray(key)) {
      if (key.length === 0) return this;
      return this.get(key[0])?.get(key.slice(1)) || null;
    }

    const ans = this._getProperty(key);
    return (ans && this.$context.get(ans, this, key)) || null;
  }

  readKey(raw: any): unknown | undefined {
    const keyBy = isObject(this.key) ? this.key.import : this.key;

    if (typeof keyBy === 'string') {
      return isObject(raw) ? raw[keyBy] : void 0;
    } else {
      return keyBy(raw);
    }
  }

  writeKey(dest: any, key: any): void {
    const write = isObject(this.key) ? this.key.export : this.key;

    if (typeof write === 'string') {
      if (isObject(dest)) dest[write] = key;
    } else {
      write(dest, key);
    }
  }
}

export class ArraySchema extends makeDataClass<Required<ArraySchemaDescriptor>>() {
  readonly $context: SchemaContext;
  readonly $id: string;
  readonly items!: Schema;

  constructor($context: SchemaContext, $id: string, input: ArraySchemaDescriptor) {
    super({ ...input });
    this.$context = $context;
    this.$id = $id;

    const rawItems = this.items;
    defineLazyGetter(this, 'items', () => {
      const s = $context.get(rawItems, this, 'items');
      if (!s) throw new Error(`ArraySchema ${this.$id} has invalid items configuration`);
      return s;
    });
  }

  /**
   * get property schema
   *
   * @param key can be a string, number or string[]
   * @returns in most cases, just return `this.items` the Schema
   */
  get(key: null | undefined | string | number | (string | number)[]): Schema | null {
    if (key == null) return null;
    if (Array.isArray(key)) {
      if (key.length === 0) return this;
      return this.get(key[0])?.get(key.slice(1)) || null;
    }

    return this.items;
  }
}
