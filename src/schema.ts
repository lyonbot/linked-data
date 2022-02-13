export abstract class NodeSchema {
  name?: string;

  setName(name: string): this {
    this.name = name;
    return this;
  }
}

export class ObjectNodeSchema extends NodeSchema {
  properties: Record<string, NodeSchema> = {};

  constructor(properties?: Record<string, NodeSchema>) {
    super();
    if (properties) this.defineProperties(properties);
  }

  defineProperties(properties: Record<string, NodeSchema>) {
    Object.keys(properties).forEach(property => {
      this.defineProperty(property, properties[property]);
    });

    return this;
  }

  defineProperty(property: string, nodeSchema: NodeSchema): this {
    this.properties[property] = nodeSchema;
    return this;
  }
}

export class ArrayNodeSchema extends NodeSchema {
  constructor(public item: NodeSchema) {
    super();
  }

  defineItem(item: NodeSchema): this {
    this.item = item;
    return this;
  }
}

const getCtorFunction = <T extends new (...args: any[]) => any>(ctor: T) => {
  return function (...args: ConstructorParameters<T>): InstanceType<T> {
    return new ctor(...args);
  };
};

export const S = {
  object: getCtorFunction(ObjectNodeSchema),
  array: getCtorFunction(ArrayNodeSchema),
};
