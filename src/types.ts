/**
 * an array containing strings and numbers
 *
 * @public
 */
export type Path = (string | number)[];

/**
 * a object or array
 *
 * @public
 */
export type AnyObject = Record<string, any> | any[];

/**
 * a patching operation. can be SetPatchOp | DeletePatchOp | ResortArrayPatchOp
 *
 * @public
 */
export type PatchOp = SetPatchOp | DeletePatchOp | ResortArrayPatchOp;

/**
 * @public
 */
export interface PatchOpBase {
  op: string;
  path: Path;
}

/**
 * a "set" patching operation. set a property of object / item of array
 *
 * for array / object.
 *
 * @public
 */
export interface SetPatchOp extends PatchOpBase {
  op: 'set';
  value: any;
}

/**
 * a "delete" patching operation. delete a property from object.
 *
 * for object only.
 *
 * @public
 */
export interface DeletePatchOp extends PatchOpBase {
  op: 'delete';
}

/**
 * a "resort" patching operation. make a new array, whose partial items can be taken from original array. new array's length may vary.
 *
 * for array only.
 *
 * `indexMap` indicates each item in original array's content:
 * - `-1` means empty slot (which will be filled by following "set" operation)
 * - otherwise, the index of original array's item
 *
 * @public
 */
export interface ResortArrayPatchOp extends PatchOpBase {
  op: 'resortArray';
  indexMap: number[];
}
