/* istanbul ignore file */

// ----------------------------------------------------------
// core

export { LinkedData, DataNode, DataNodeStatus } from './LinkedData';
export type { LinkedDataOptions, LinkedDataEvents, LinkedDataImportOptions } from './LinkedData';

export { toRef, isDataNodeRef } from './DataNodeRef';
export type { DataNodeRef } from './DataNodeRef';

// ----------------------------------------------------------
// load and dump

export { loadDataNodes, dumpDataNodes, fromJsonSafeRaw, toJsonSafeRaw } from './loadDump';
export type { DumpedNode, JSONSafeData } from './loadDump';

// ----------------------------------------------------------
// mutations / modifications / patches

export { ModificationObserver } from './ModificationObserver';
export type { ModificationRecord } from './ModificationObserver';

export { derive } from './derive';
export type { DeriveOptions, DeriveReport } from './derive';

export { applyPatches } from './applyPatches';

// ----------------------------------------------------------
// misc

export { EventEmitter } from './EventEmitter';

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

export type { Path, AnyObject, PatchOp, PatchOpBase, DeletePatchOp, ResortArrayPatchOp, SetPatchOp } from './types';

export type {
  ArraySchema,
  ArraySchemaDescriptor,
  ObjectSchema,
  ObjectSchemaDescriptor,
  Schema,
  SchemaContext,
  SchemaDescriptor,
} from './schema';
