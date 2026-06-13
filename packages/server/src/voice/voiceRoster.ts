/** Authoritative in-memory voice roster: who is in voice at each table (capped). */
import { VOICE_MESH_CAP } from '@akpoker/shared';

export class VoiceRoster {
  private byTable = new Map<string, Set<string>>();

  peers(tableId: string): string[] {
    return [...(this.byTable.get(tableId) ?? [])];
  }

  /** Add a user; returns false if the mesh is at capacity. */
  add(tableId: string, userId: string): boolean {
    const set = this.byTable.get(tableId) ?? new Set<string>();
    if (set.has(userId)) {
      this.byTable.set(tableId, set);
      return true;
    }
    if (set.size >= VOICE_MESH_CAP) return false;
    set.add(userId);
    this.byTable.set(tableId, set);
    return true;
  }

  remove(tableId: string, userId: string): void {
    const set = this.byTable.get(tableId);
    if (!set) return;
    set.delete(userId);
    if (set.size === 0) this.byTable.delete(tableId);
  }

  /** Remove a user from every table's voice (on disconnect). Returns affected tableIds. */
  removeEverywhere(userId: string): string[] {
    const affected: string[] = [];
    for (const [tableId, set] of this.byTable) {
      if (set.delete(userId)) {
        affected.push(tableId);
        if (set.size === 0) this.byTable.delete(tableId);
      }
    }
    return affected;
  }
}
