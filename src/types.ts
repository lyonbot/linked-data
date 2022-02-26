export type Path = (string | number)[];
export type AnyObject = Record<string, any> | any[];

export type PatchOp = SetPatchOp | DeletePatchOp | ResortArrayPatchOp;

export interface PatchOpBase {
  op: string;
  path: Path;
}

export interface SetPatchOp extends PatchOpBase {
  op: 'set';
  value: any;
}

export interface DeletePatchOp extends PatchOpBase {
  op: 'delete';
}

/**
 * resort original array based on indexMap. there could be empty slots
 */
export interface ResortArrayPatchOp extends PatchOpBase {
  op: 'resortArray';
  indexMap: number[];
}
