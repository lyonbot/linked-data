import { isObject, isPlainObject } from './utils/index';

export function warnIfNotPlainObject(value: any): void {
  if (isObject(value) && !isPlainObject(value)) {
    console.warn(
      `We only accept plain value / object / array, but got a ${
        /* istanbul ignore next */
        Object.getPrototypeOf(value)?.constructor?.name || '[Unknown Class]'
      }`,
    );
  }
}

export const VOID_NODE_ERROR = 'DataNode is void, please set value before using';
export const BROKEN_REF_ERROR = 'The referring DataNode is broken';
