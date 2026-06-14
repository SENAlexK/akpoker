import { MAX_CHAT_LEN, type ChatKind } from '@akpoker/shared';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { api } from '../../lib/api.js';
import { emitAck } from '../../lib/socket/socketService.js';
import { useTableStore } from '../../store/tableStore.js';

const EMOJIS = ['😀', '😂', '😅', '😍', '😎', '🤔', '👍', '👎', '👏', '🙏', '🔥', '💪', '🎉', '😭', '😡', '🤯', '💰', '🃏', '🆗', '❤️'];

/** Semi-transparent chat: text + emoji + image + voice clips. Docked right on desktop, drawer on mobile. */
export function ChatPanel({ tableId }: { tableId: string }) {
  const { t } = useTranslation();
  const messages = useTableStore((s) => s.messages);
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [showEmoji, setShowEmoji] = useState(false);
  const [recording, setRecording] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const recRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [messages, open]);

  const sendMedia = (kind: ChatKind, mediaUrl: string) =>
    void emitAck('chat:send', { tableId, kind, mediaUrl }).catch(() => toast.error('发送失败'));

  const sendText = (e: React.FormEvent) => {
    e.preventDefault();
    const v = text.trim();
    if (!v) return;
    void emitAck('chat:send', { tableId, kind: 'text', text: v.slice(0, MAX_CHAT_LEN) }).catch(() => {});
    setText('');
    setShowEmoji(false);
  };

  const onPickImage = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    try {
      const { url } = await api.chatUpload(f, f.name);
      sendMedia('image', url);
    } catch {
      toast.error('图片上传失败');
    }
  };

  const toggleRecord = async () => {
    if (recording) {
      recRef.current?.stop();
      setRecording(false);
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      toast.error('录音需要 HTTPS / 系统浏览器');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream);
      chunksRef.current = [];
      mr.ondataavailable = (ev) => ev.data.size && chunksRef.current.push(ev.data);
      mr.onstop = async () => {
        stream.getTracks().forEach((tk) => tk.stop());
        const blob = new Blob(chunksRef.current, { type: mr.mimeType || 'audio/webm' });
        try {
          const { url } = await api.chatUpload(blob, 'voice.webm');
          sendMedia('audio', url);
        } catch {
          toast.error('语音上传失败');
        }
      };
      mr.start();
      recRef.current = mr;
      setRecording(true);
    } catch {
      toast.error('无法录音（麦克风权限被拒）');
    }
  };

  return (
    <>
      <button
        onClick={() => setOpen((o) => !o)}
        className="absolute bottom-2 right-2 z-40 flex h-11 w-11 items-center justify-center rounded-full bg-emerald-700/80 text-lg shadow-lg ring-1 ring-emerald-400/40 backdrop-blur sm:hidden"
        aria-label={t('table.chat')}
      >
        💬{messages.length > 0 && !open ? <span className="absolute -top-1 -right-1 h-2.5 w-2.5 rounded-full bg-rose-500" /> : null}
      </button>

      <div
        className={[
          'z-40 flex-col rounded-xl bg-black/45 ring-1 ring-emerald-700/30 backdrop-blur-sm',
          'sm:absolute sm:right-2 sm:top-2 sm:bottom-2 sm:flex sm:w-64',
          open ? 'fixed inset-y-0 right-0 flex w-4/5 max-w-xs' : 'hidden',
        ].join(' ')}
      >
        <div className="flex items-center justify-between border-b border-emerald-700/30 px-3 py-2 text-sm text-emerald-200">
          <span>💬 {t('table.chat')}</span>
          <button onClick={() => setOpen(false)} className="text-emerald-300/70 sm:hidden">
            ✕
          </button>
        </div>

        <div ref={listRef} className="flex-1 space-y-1.5 overflow-y-auto px-3 py-2 text-sm">
          {messages.map((m, i) => (
            <div key={i} className="break-words">
              <span className="font-semibold text-emerald-300">{m.nickname}</span>
              {m.kind === 'text' && <span className="text-emerald-100">: {m.text}</span>}
              {m.kind === 'image' && m.mediaUrl && (
                <a href={m.mediaUrl} target="_blank" rel="noreferrer">
                  <img src={m.mediaUrl} alt="" className="mt-1 max-h-40 max-w-full rounded-lg" />
                </a>
              )}
              {m.kind === 'audio' && m.mediaUrl && (
                <audio src={m.mediaUrl} controls className="mt-1 h-8 w-full" />
              )}
            </div>
          ))}
        </div>

        {showEmoji && (
          <div className="flex flex-wrap gap-1 border-t border-emerald-700/30 px-2 py-1">
            {EMOJIS.map((e) => (
              <button key={e} type="button" onClick={() => setText((x) => x + e)} className="text-xl">
                {e}
              </button>
            ))}
          </div>
        )}

        <form onSubmit={sendText} className="flex items-center gap-1 border-t border-emerald-700/30 p-2">
          <button type="button" onClick={() => setShowEmoji((s) => !s)} className="text-lg" title="emoji">
            😀
          </button>
          <button type="button" onClick={() => fileRef.current?.click()} className="text-lg" title="图片">
            🖼
          </button>
          <button
            type="button"
            onClick={() => void toggleRecord()}
            className={`text-lg ${recording ? 'animate-pulse text-rose-400' : ''}`}
            title="语音"
          >
            {recording ? '⏺' : '🎤'}
          </button>
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => void onPickImage(e)} />
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            maxLength={MAX_CHAT_LEN}
            placeholder={t('table.chatPlaceholder')}
            className="min-w-0 flex-1 rounded-lg bg-emerald-900/50 px-2 py-1.5 text-sm text-emerald-50 outline-none ring-1 ring-emerald-700/40"
          />
          <button type="submit" className="rounded-lg bg-emerald-600 px-2.5 text-sm text-emerald-50 hover:bg-emerald-500">
            {t('table.send')}
          </button>
        </form>
      </div>
    </>
  );
}
