import { QUICK_CHATS } from '@akpoker/shared';
import { useState } from 'react';
import { getSocket } from '../../lib/socket/socketService.js';

/** Quick-chat (QQ-style): pick a preset phrase -> a bubble pops next to your seat. */
export function QuickChat({ tableId }: { tableId: string }) {
  const [open, setOpen] = useState(false);
  const send = (index: number) => {
    getSocket().emit('table:bubble', { tableId, index });
    setOpen(false);
  };
  return (
    <div className="relative shrink-0">
      <button
        onClick={() => setOpen((o) => !o)}
        className="rounded bg-emerald-800 px-2 py-1 text-xs text-emerald-100"
        title="快捷喊话"
      >
        💭
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-9 z-50 w-56 rounded-lg bg-emerald-950 p-1.5 shadow-xl ring-1 ring-emerald-700/50">
            {QUICK_CHATS.map((c, i) => (
              <button
                key={i}
                onClick={() => send(i)}
                className="block w-full rounded px-2 py-1.5 text-left text-sm text-emerald-100 hover:bg-emerald-800"
              >
                {c}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
