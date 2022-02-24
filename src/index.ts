/* istanbul ignore file */

export { LinkedData, DataNode, DataNodeStatus } from './LinkedData';
export { toRef, isDataNodeRef } from './DataNodeRef';
export { loadDataNodes, dumpDataNodes } from './loadDump';
export {
  isObject,
  isPlainObject,
  mapValues,
  makeDataClass,
  makeGetterFromDictionary,
  createFactoryFromClass,
  castConstructor,
} from './utils';

export type { LinkedDataOptions, LinkedDataImportOptions } from './LinkedData';
export type { DataNodeRef } from './DataNodeRef';
export type { DumpedNode } from './loadDump';
export type {
  ArraySchema,
  ArraySchemaDescriptor,
  ObjectSchema,
  ObjectSchemaDescriptor,
  Schema,
  SchemaContext,
  SchemaDescriptor,
} from './schema';
