/**
 * Single-shot turn timer. On expiry it invokes the supplied callback (which the
 * table routes through its ActionQueue so a real action can't race the timeout).
 */
export class TurnTimer {
  private handle: ReturnType<typeof setTimeout> | null = null;
  private deadline: number | null = null;

  arm(ms: number, onExpire: () => void): void {
    this.clear();
    this.deadline = Date.now() + ms;
    this.handle = setTimeout(onExpire, ms);
    if (typeof this.handle === 'object' && 'unref' in this.handle) this.handle.unref();
  }

  clear(): void {
    if (this.handle) clearTimeout(this.handle);
    this.handle = null;
    this.deadline = null;
  }

  get deadlineAt(): number | null {
    return this.deadline;
  }
}
