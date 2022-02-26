import { DefaultListener, ListenerSignature, TypedEmitter } from 'tiny-typed-emitter';

/**
 * based on regular EventEmitter, this provides `subscribe()`, which will return a "unsubscribe" function
 *
 * @public
 */
export class EventEmitter<L extends ListenerSignature<L> = DefaultListener> extends TypedEmitter<L> {
  /**
   * @returns a function to unsubscribe
   */
  subscribe<U extends keyof L>(event: U, listener: L[U]): () => void {
    this.on(event, listener);
    return () => {
      this.off(event, listener);
    };
  }

  /**
   * @returns a function to unsubscribe
   */
  subscribeOnce<U extends keyof L>(event: U, listener: L[U]): () => void {
    this.once(event, listener);
    return () => {
      this.off(event, listener);
    };
  }
}
