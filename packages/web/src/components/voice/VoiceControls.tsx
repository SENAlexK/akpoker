import { useVoiceStore } from '../../store/voiceStore.js';

interface Props {
  onEnable: () => void;
  onToggleMute: () => void;
}

export function VoiceControls({ onEnable, onToggleMute }: Props) {
  const enabled = useVoiceStore((s) => s.enabled);
  const muted = useVoiceStore((s) => s.muted);
  const peers = useVoiceStore((s) => s.peers);
  const connected = Object.values(peers).filter(Boolean).length;

  if (!enabled) {
    return (
      <button
        onClick={onEnable}
        className="flex items-center gap-1 rounded-full bg-emerald-700 px-3 py-1.5 text-xs text-emerald-50 hover:bg-emerald-600"
        title="开启语音"
      >
        🎙 语音
      </button>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={onToggleMute}
        className={`flex items-center gap-1 rounded-full px-3 py-1.5 text-xs ${
          muted ? 'bg-rose-700 text-rose-50' : 'bg-emerald-600 text-emerald-50'
        }`}
      >
        {muted ? '🔇 静音' : '🎙 开麦'}
      </button>
      <span className="text-xs text-emerald-300/70">🔊 {connected}</span>
    </div>
  );
}
