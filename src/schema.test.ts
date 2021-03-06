import { SchemaDescriptor, SchemaContext, ObjectSchema, ArraySchema } from './schema';
import { isObject } from './utils';

describe('Schema', () => {
  it('should work', () => {
    const schemas: Record<string, SchemaDescriptor | string> = {
      Root: 'Pagelet', // alias
      Pagelet: {
        type: 'object',
        properties: {
          content: 'Layout',
        },
      },
      Layout: {
        type: 'object',
        properties: {
          children: 'LayoutArray',
          slots: {
            // anonymous schema
            type: 'object',
            properties: {
              '/.+/': 'LayoutArray', // use regex as key
            },
          },
        },
      },
      LayoutArray: {
        type: 'array',
        items: 'Layout',
      },
    };

    const context = new SchemaContext(schemas);

    const Root = context.get('Root') as ObjectSchema;
    const Pagelet = context.get('Pagelet') as ObjectSchema;
    const Layout = context.get('Layout') as ObjectSchema;
    const LayoutArray = context.get('LayoutArray') as ArraySchema;

    expect(Root).toBe(Pagelet);

    expect(Pagelet.type).toBe('object');
    expect(Layout.type).toBe('object');

    expect(Pagelet.get(null)).toBe(null);
    expect(Pagelet.get('invalid')).toBe(null);

    expect(Pagelet.get('content')).toBe(Layout);
    expect(Layout.get('children')).toBe(LayoutArray);
    expect(LayoutArray.get('0')).toBe(Layout);

    // anonymous schema
    const slots = Layout.get('slots')!;
    expect(Layout.get('slots')).toBe(slots);
    expect(slots.get('foobar')).toBe(LayoutArray);
    expect(slots.get('baz')).toBe(LayoutArray);

    // get schema by path
    expect(context.get('#/Pagelet/content/children/5')).toBe(Layout);
    expect(context.get(['Pagelet', 'content', 'children', '5'])).toBe(Layout);
    expect(context.get('#/')).toBe(null);
    expect(context.get([])).toBe(null);

    expect(Pagelet.get([])).toBe(Pagelet);
    expect(Pagelet.get(['content', 'children', '5'])).toBe(Layout);
    expect(Pagelet.get(['content', 'children', '5', 'children'])).toBe(LayoutArray);
  });

  it('ObjectSchema: keying', () => {
    const schemas = new SchemaContext({
      Message: {
        type: 'object',
        key: 'id',
        properties: {
          replies: { type: 'array', items: 'Message' },
        },
      },
    });

    const Message = schemas.get('Message') as ObjectSchema;

    expect(Message.readKey(0)).toBeUndefined();
    expect(Message.readKey(null)).toBeUndefined();
    expect(Message.readKey({})).toBeUndefined();
    expect(Message.readKey({ id: 1234 })).toBe(1234);

    const temp = {} as any;
    Message.writeKey(temp, 1234);
    expect(temp.id).toBe(1234);

    // shall not throw
    Message.writeKey(null, 1234);
  });

  it('ObjectSchema: keying: custom procedure', () => {
    const read = jest.fn((raw: any) => (isObject(raw) ? raw.id : void 0));
    const write = jest.fn((dest: any, id: any) => {
      expect(typeof dest).toBe('object') // non-object dest will not be called
      dest.id = id;
    });

    const schemas = new SchemaContext({
      Message: {
        type: 'object',
        key: { import: read, export: write },
        properties: {
          replies: { type: 'array', items: 'Message' },
        },
      },
    });

    const Message = schemas.get('Message') as ObjectSchema;

    expect(Message.readKey(0)).toBeUndefined();
    expect(Message.readKey(null)).toBeUndefined();
    expect(Message.readKey({})).toBeUndefined();
    expect(Message.readKey({ id: 1234 })).toBe(1234);

    const temp = {} as any;
    Message.writeKey(temp, 1234);
    expect(temp.id).toBe(1234);

    Message.writeKey(null, 1234);

    expect(read).toBeCalledTimes(4);
    expect(write).toBeCalledTimes(1); // non-object dest will not be called
  });

  it('ObjectSchema: change schema on the fly', () => {
    const schemas = new SchemaContext({
      Message: {
        type: 'object',
        properties: {
          replies: { type: 'array', items: 'Message' },
        },
      },
    });

    const Message = schemas.get('Message') as ObjectSchema;

    expect(Message.get('parent')).toBe(null);
    expect(Message.get('replies')).not.toBe(null);

    // ----------------------------
    // add and remove properties

    Message.addProperties({ parent: 'Message' });

    expect(Message.get('parent')).toBe(Message);
    expect(Message.get('replies')).not.toBe(null);

    Message.removeProperties(['replies']);

    expect(Message.get('parent')).toBe(Message);
    expect(Message.get('replies')).toBe(null);

    // ----------------------------
    // not recommended: set Message.properties directly

    Message.properties = { ...Message.properties, root: 'Message' };

    expect(Message.get('root')).toBe(Message);
    expect(Message.get('parent')).toBe(Message);
  });
});
