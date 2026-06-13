/**
 * Per-table FIFO serializer: at most one mutation in flight per table, so every
 * state transition (player action, timer firing, sit/leave, hand start) is atomic
 * without locks. A rejected job never breaks the chain.
 */
export class ActionQueue {
  private tail: Promise<unknown> = Promise.resolve();

  run<T>(job: () => Promise<T> | T): Promise<T> {
    const result = this.tail.then(job);
    this.tail = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }
}
