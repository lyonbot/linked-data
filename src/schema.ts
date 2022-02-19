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

  get(x: string | SchemaDescriptor | Schema | null | undefined, via?: Schema, viaKey?: string) {
    while (x && typeof x === 'string') x = this._dict[x];

    if (!x || typeof x !== 'object') return null;
    if ('$context' in x) return x;

    const key = this._sdMap.get(x);
    if (key) return key;

    const tempId = `${via!.$id}/${viaKey!}`;
    const s = this.register(tempId, x)!;
    this._anon.add(s);
    return s;
  }

  isAnonymousSchema(schema: Schema) {
    return this._anon.has(schema);
  }
}

export type Schema = ObjectSchema | ArraySchema;

export class ObjectSchema extends makeDataClass<Required<ObjectSchemaDescriptor>>() {
  private readonly _get = makeGetterFromDictionary(this.properties);

  readonly $context: SchemaContext;
  readonly $id: string;

  constructor($context: SchemaContext, $id: string, input: ObjectSchemaDescriptor) {
    super({ key: '_id', ...input });
    this.$context = $context;
    this.$id = $id;
  }

  /**
   * get property schema
   *
   * @param key
   * @returns Schema
   */
  get(key: any) {
    const ans = this._get(key);
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
   * pseudo-getter for items. always return `this.items`
   *
   * @returns always return `this.items`
   */
  get(_?: any) {
    return this.items;
  }
}
