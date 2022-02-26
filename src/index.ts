/* istanbul ignore file */

export { LinkedData, DataNode, DataNodeStatus } from './LinkedData';
export type { LinkedDataOptions, LinkedDataEvents, LinkedDataImportOptions } from './LinkedData';

export { toRef, isDataNodeRef } from './DataNodeRef';
export type { DataNodeRef } from './DataNodeRef';

export { loadDataNodes, dumpDataNodes } from './loadDump';
export type { DumpedNode } from './loadDump';

export { EventEmitter } from './EventEmitter';

export { ModificationObserver } from './ModificationObserver';
export type { ModificationRecord } from './ModificationObserver';

export { derive } from './derive';
export type { DeriveOptions, DeriveReport } from './derive';

export { applyPatches } from './applyPatches';

export {
  isObject,
  isPlainObject,
  mapValues,
  makeDataClass,
  makeGetterFromDictionary,
  createFactoryFromClass,
  castConstructor,
  memoWithWeakMap,
} from './utils';

export type {
  ArraySchema,
  ArraySchemaDescriptor,
  ObjectSchema,
  ObjectSchemaDescriptor,
  Schema,
  SchemaContext,
  SchemaDescriptor,
} from './schema';
