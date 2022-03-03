import { useReducer } from 'react/hooks';

export function useForceUpdate() {
  const [, update] = useReducer(x => x + 1, 0);
  return update as (...args: any[]) => void;
}
