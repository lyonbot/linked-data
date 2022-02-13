# linked-data

Load and edit linked data easily

![](./images/concept.drawio.svg)

## Concept

Let's say we have such nested data:

```js
const data = {
  type: 'card',
  theme: 'black',
  children: [
    { type: 'paragraph', children: ['Welcome'] },
    { id: 'openBtn', type: 'button', children: ['Open'] },
  ],
};
```

Given some rules ... (usually described with JSON Schema, TypeScript Declarations and custom schemas)

- **(mandatory)** entry is a _Node_
- _Node_ is object or string
- if a _Node_ is object:
  - take the _Node_'s `id` as primary key 🔑
  - _Node_'s `children` is _Array&lt;Node>_ 🔗

We can separate it into

```js
var entry = 'unnamed_card';
var nodes = {
  // the entry data
  unnamed_card: {
    type: 'card',
    theme: 'black',
    children: [
      $ref(unnamed_paragraph), // 🔗 referring Node
      $ref(openBtn), // --------- 🔗 referring Node
    ],
  },

  // extracted node without id
  unnamed_paragraph: {
    type: 'paragraph',
    children: [
      $ref(unnamed_text), // 🔗 referring Node
    ],
  },

  // extracted string node
  unnamed_text: 'Welcome',

  // extracted node with id
  openBtn: {
    id: 'openBtn',
    type: 'button',
    children: [
      $ref(unnamed_text_2), // 🔗 referring Node
    ],
  },

  // extracted another string node
  // added _2 suffix to avoid duplicating
  unnamed_text_2: 'Open',
};
```

### Manipulating and Tracking Mutations

We want to manipulate *Node*s easily and get mutations easily.

It is tedious to manipulating the separated node list. People prefer to manipulate the original nested data.

```js
// card is the in original nested structure

card.theme = 'light';
card.children.push('another text');

const button = card.children.find(child => child.id === 'openBtn');
button.children.push({ type: 'icon', icon: 'caret-right' });

// card is modified now
```

And we want to gather and describe the procedure :

0. modify **card.theme** set to `'light'`

1. create **unnamed_text_3** = `'another text'`

2. modify **entry.children** append `$ref(unnamed_text_3)` 🔗

3. create **unnamed_icon** = `{ type: 'icon', icon: 'caret-right' }`

4. modify **openBtn.children** append `$ref(unnamed_icon)` 🔗

### Mutable & Immutable

In the separated _Node_ list, every node is independent.
If you modify a _Node_, the other *Node*s referring it will NOT be mutated
-- they only have a _reference_, not a _value_.

Therefore, the nested data containing lots of *Node*s, is close to "**mutable**" philosophy.

We only cares about when a _Node_'s value changes. You can maintain in **mutable** way or **immutable** way
-- it doesn't matter, as long as you can notify us that value is changed.

💡 We suggest that maintain _Node value_ in **immutable** way.
It allows external libraries to utilize `Object.is(x, y)` and low-costly distinguish whether _value_ is really changed,
where _value_ can be the whole Node or some property from Node.

<details>

<summary>💭 Some thoughts and facts</summary>

- To be aggressive, if we treat every object/array as _Node_ regardless of their semantic purposes,
  we will get Vue or Mobx -- every non-primitive value can be "observed".

- Web Component's attributes are always primitive data, which makes the comparison simple and low-cost.

</details>

### Dependency Graph

Every Node can be referred.

It's easy to find out a Node's dependents with _linked-data_ because we collects necessary info while generating the separated Node list.

The dependency graph may be circular.

### Identifier

Every Node needs an identifier.

💡 Identifiers shall be **permanent, readonly, final** to a Node.

💡 In a certain context, identifiers shall be **unique**.

We shall _always_ store it within Node's value. If a input Node has no identifier, we shall generated one, in current context.

You can see lots of generated, `unnamed_`-prefixed identifiers in the example above.

<details>

<summary>💭 Some thoughts and facts</summary>

- Vue doesn't need one because

  1. Each object instance has a memory address in JavaScript engine.
     We can use memory address as the identifier because Identifier's properties apply to memory addresses.

  2. Vue doesn't hydrate two nested data.

- MongoDB generates `_id` for each document.

</details>

### Value shall be schema-free

Schema is NOT the only guideline to create references.

User may create references anywhere when needed. This is like refactoring, you can extract anything to a constant / module / variable.

The separated Node list shall be **schema-free** so we can maintain it even when rules/schemas absent.

### Node to Schema
