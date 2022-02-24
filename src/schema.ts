import { isObject, makeDataClass, makeGetterFromDictionary } from './utils';
import defineLazyGetter from './utils/lazyGetter';

/**
 * @public
 */
export type SchemaDescriptor = ObjectSchemaDescriptor | ArraySchemaDescriptor;

/**
 * @public
 */
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
        /**
         * custom function to generate a key.
         *
         * @param raw - raw data to fill this node, can be object and non-object
         * @returns the key (string), or `undefined` to allow system generate one
         */
        import: string | ((raw: any) => string | undefined | void);
        /**
         * custom function to write key into the exported data.
         *
         * @param dest - destination, always a object
         * @param id - the identifier (string) to write
         * @example - (dest, id) => { dest['_id'] = id; }
         */
        export: string | ((dest: any, id: string) => void);
      };
}

/**
 * @public
 */
export interface ArraySchemaDescriptor {
  type: 'array';
  items: string | SchemaDescriptor;
}

/**
 * schema manager, you can register schemas from SchemaDescriptor, and retrieve schemas by name / path
 *
 * @public
 */
export class SchemaContext {
  private _dict: Record<string, Schema | string> = Object.create(null);
  private _sdMap: Map<SchemaDescriptor, Schema> = new Map();
  private _anon: Set<Schema> = new Set();

  constructor(schemas: Record<string, SchemaDescriptor | string> = {}) {
    Object.keys(schemas).forEach(key => {
      this.register(key, schemas[key]);
    });
  }

  /**
   * register a schema
   *
   * @param id - schema id
   * @param x - can be a SchemaDescriptor or a existing Schema's id (if you want to create an alias)
   * @returns
   */
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

  /**
   * get schema by id or path
   *
   * @param query - can be...
   *
   *    1. a schema id, e.g. `User`
   *    2. a path string (e.g. `'#/User/friends/2'`)
   *    3. a path array (e.g. `['User', 'friends', 2]`)
   *    4. (for internal use) a SchemaDescriptor or Schema instance
   *
   * @returns
   */
  get(
    query: string[] | string | SchemaDescriptor | Schema | null | undefined,
    via?: Schema,
    viaKey?: string | number,
  ): Schema | null {
    // first process #/
    // maybe is a path "#/Schema1/foo/bar"

    if (typeof query === 'string') {
      if (query.startsWith('#/')) {
        const parts = query.slice(2).split('/');
        return this.get(parts);
      }
    }

    // resolve alias (in _dict, value can be string)

    while (query && typeof query === 'string') query = this._dict[query];
    if (!query || typeof query === 'string') return null;

    if (Array.isArray(query)) {
      if (!query[0]) return null;
      return query.slice(1).reduce((p, c) => p && p.get(c), this.get(query[0]));
    }

    if ('$context' in query) return query; // already a Schema instance, just return

    const key = this._sdMap.get(query);
    if (key) return key;

    // for anonymous schema, when we first encounter it, it is not in `_sdMap`
    // we need to create a new Schema instance and give it a path-like id

    let tempId = `${via!.$id}/${viaKey!}`;
    if (!tempId.startsWith('#/')) tempId = `#/${tempId}`;
    const s = this.register(tempId, query)!;
    this._anon.add(s);
    return s;
  }
}

/**
 * Schema instance. Derived from SchemaDescriptor, with few extra useful methods.
 *
 * @public
 */
export type Schema = ObjectSchema | ArraySchema;

/**
 * ObjectSchema instance. Derived from ObjectSchemaDescriptor, with few extra useful methods.
 *
 * @public
 */
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
   * @param key - can be a string, number or string[]
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
    if (!isObject(dest)) return;
    const write = isObject(this.key) ? this.key.export : this.key;

    if (typeof write === 'string') {
      dest[write] = key;
    } else {
      write(dest, key);
    }
  }
}

/**
 * ArraySchema instance. Derived from ArraySchemaDescriptor, with few extra useful methods.
 *
 * @public
 */
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
   * @param key - can be a string, number or string[]
   * @returns in most cases, just return `this.items` the Schema
   */
  get(key: null | undefined | string | number | (string | number)[]): Schema | null {
    if (key == null) return null;
    if (Array.isArray(key)) {
      if (key.length === 0) return this;
      return this.get(key[0])?.get(key.slice(1)) || null;
    }

    const toNum = +key;
    if (toNum >= 0 && Number.isInteger(toNum)) return this.items;

    return null;
  }
}
