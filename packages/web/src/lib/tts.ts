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

export function speak(text: string): void {
  if (isBubbleMuted()) return;
  try {
    const synth = window.speechSynthesis;
    if (!synth) return;
    synth.cancel(); // interrupt any in-progress utterance
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'zh-CN';
    u.rate = 1.05;
    synth.speak(u);
  } catch {
    /* speech synthesis unavailable — ignore */
  }
}
