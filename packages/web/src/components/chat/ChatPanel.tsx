import { MAX_CHAT_LEN } from '@akpoker/shared';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { emitAck } from '../../lib/socket/socketService.js';
import { useTableStore } from '../../store/tableStore.js';

/**
 * Semi-transparent chat. Docked on the right on desktop (never fully blocking the
 * felt — translucent + backdrop blur). On mobile it's a toggle drawer opened by a
 * floating button so it doesn't cover the table by default.
 */
export function ChatPanel({ tableId }: { tableId: string }) {
  const { t } = useTranslation();
  const messages = useTableStore((s) => s.messages);
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [messages, open]);

  const send = (e: React.FormEvent) => {
    e.preventDefault();
    const v = text.trim();
    if (!v) return;
    void emitAck('chat:send', { tableId, text: v.slice(0, MAX_CHAT_LEN) }).catch(() => {});
    setText('');
  };

  const unread = messages.length;

  return (
    <>
      {/* Mobile toggle button */}
      <button
        onClick={() => setOpen((o) => !o)}
        className="absolute bottom-2 right-2 z-40 flex h-11 w-11 items-center justify-center rounded-full bg-emerald-700/80 text-lg shadow-lg ring-1 ring-emerald-400/40 backdrop-blur sm:hidden"
        aria-label={t('table.chat')}
      >
        💬{unread > 0 && !open ? <span className="absolute -top-1 -right-1 h-2.5 w-2.5 rounded-full bg-rose-500" /> : null}
      </button>

      <div
        className={[
          'z-40 flex-col rounded-xl bg-black/45 ring-1 ring-emerald-700/30 backdrop-blur-sm',
          // desktop: docked to the right of the table area, translucent
          'sm:absolute sm:right-2 sm:top-2 sm:bottom-2 sm:flex sm:w-64',
          // mobile: drawer when open, hidden otherwise
          open ? 'fixed inset-y-0 right-0 flex w-4/5 max-w-xs' : 'hidden',
        ].join(' ')}
      >
        <div className="flex items-center justify-between border-b border-emerald-700/30 px-3 py-2 text-sm text-emerald-200">
          <span>💬 {t('table.chat')}</span>
          <button onClick={() => setOpen(false)} className="text-emerald-300/70 sm:hidden">
            ✕
          </button>
        </div>

        <div ref={listRef} className="flex-1 space-y-1 overflow-y-auto px-3 py-2 text-sm">
          {messages.map((m, i) => (
            <div key={i} className="break-words">
              <span className="font-semibold text-emerald-300">{m.nickname}</span>
              <span className="text-emerald-100">: {m.text}</span>
            </div>
          ))}
        </div>

        <form onSubmit={send} className="flex gap-1 border-t border-emerald-700/30 p-2">
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            maxLength={MAX_CHAT_LEN}
            placeholder={t('table.chatPlaceholder')}
            className="min-w-0 flex-1 rounded-lg bg-emerald-900/50 px-2 py-1.5 text-sm text-emerald-50 outline-none ring-1 ring-emerald-700/40"
          />
          <button type="submit" className="rounded-lg bg-emerald-600 px-3 text-sm text-emerald-50 hover:bg-emerald-500">
            {t('table.send')}
          </button>
        </form>
      </div>
    </>
  );
}
