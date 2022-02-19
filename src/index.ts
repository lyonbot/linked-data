export class Context {
  nodes: Map<string, Node> = new Map();
  v2nLUT: WeakMap<any, Node> = new WeakMap();

  allocIdentifier(value: any): string {
    return '';
  }

  allocNode<T = any>(value: T): Node<T> {
    return new Node(this, value);
  }
}

export class Node<T = any> {
  context: Context;
  value: T;
  id: string;

  constructor(context: Context, value: T) {
    this.context = context;
    this.value = value;
    this.id = context.allocIdentifier(value);

    context.nodes.set(this.id, this);
  }
}
