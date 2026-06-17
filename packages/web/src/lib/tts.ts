/**
 * Speak a quick-chat phrase aloud via the browser's built-in speech synthesis
 * (zh-CN), QQ-style. No audio assets needed. Can be muted (persisted).
 */
const MUTE_KEY = 'ak_bubble_mute';

export function isBubbleMuted(): boolean {
  return localStorage.getItem(MUTE_KEY) === '1';
}

export function setBubbleMuted(muted: boolean): void {
  localStorage.setItem(MUTE_KEY, muted ? '1' : '0');
}

function synthesize(text: string): void {
  try {
    const synth = window.speechSynthesis;
    if (!synth) return;
    synth.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'zh-CN';
    u.rate = 1.05;
    synth.speak(u);
  } catch {
    /* unavailable — ignore */
  }
}

/**
 * Play the pre-generated female-voice clip for a quick-chat (edge-tts, zh-CN
 * Xiaoxiao) at /voices/<index>.mp3. Falls back to on-device speech synthesis if
 * the clip is missing or playback is blocked.
 */
export function playBubbleVoice(index: number, text: string): void {
  if (isBubbleMuted()) return;
  if (index >= 0) {
    const audio = new Audio(`/voices/${index}.mp3`);
    audio.play().catch(() => synthesize(text));
  } else {
    synthesize(text);
  }
}
