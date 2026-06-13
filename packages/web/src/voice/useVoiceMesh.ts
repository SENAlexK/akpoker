/**
 * WebRTC P2P audio mesh. Signaling rides the existing Socket.IO connection.
 * Rule: the peer with the lower userId initiates the connection. Mic is requested
 * lazily on the first explicit enable() (browser autoplay/gesture rules). Capped
 * server-side at VOICE_MESH_CAP.
 */
import type { IceServerConfig } from '@akpoker/shared';
import Peer from '@thaunknown/simple-peer';
import { useCallback, useEffect, useRef } from 'react';
import { toast } from 'sonner';
import { emitAck, getSocket } from '../lib/socket/socketService.js';
import { useVoiceStore } from '../store/voiceStore.js';

interface SignalData {
  type?: 'offer' | 'answer';
  [k: string]: unknown;
}

export function useVoiceMesh(tableId: string | undefined, selfUserId: string | undefined) {
  const peers = useRef(new Map<string, Peer>());
  const audios = useRef(new Map<string, HTMLAudioElement>());
  const ice = useRef<IceServerConfig[]>([]);
  const stream = useRef<MediaStream | null>(null);
  const store = useVoiceStore;

  const removePeer = useCallback((id: string) => {
    peers.current.get(id)?.destroy();
    peers.current.delete(id);
    const a = audios.current.get(id);
    if (a) {
      a.srcObject = null;
      a.remove();
      audios.current.delete(id);
    }
    store.getState().removePeer(id);
  }, [store]);

  const attachAudio = useCallback((id: string, remote: MediaStream) => {
    let a = audios.current.get(id);
    if (!a) {
      a = document.createElement('audio');
      a.autoplay = true;
      (a as HTMLAudioElement & { playsInline?: boolean }).playsInline = true;
      a.style.display = 'none';
      document.body.appendChild(a);
      audios.current.set(id, a);
    }
    a.srcObject = remote;
    void a.play().catch(() => toast.message('点击页面以开启声音'));
  }, []);

  const createPeer = useCallback(
    (remoteId: string, initiator: boolean): Peer => {
      const p = new Peer({
        initiator,
        stream: stream.current ?? undefined,
        trickle: true,
        config: { iceServers: ice.current as RTCIceServer[] },
      });
      peers.current.set(remoteId, p);
      p.on('signal', (data) => {
        const d = data as SignalData;
        if (!tableId) return;
        if (d.type === 'offer') {
          getSocket().emit('voice:offer', { tableId, toUserId: remoteId, sdp: JSON.stringify(d) });
        } else if (d.type === 'answer') {
          getSocket().emit('voice:answer', { tableId, toUserId: remoteId, sdp: JSON.stringify(d) });
        } else {
          getSocket().emit('voice:ice-candidate', { tableId, toUserId: remoteId, candidate: JSON.stringify(d) });
        }
      });
      p.on('stream', (remote) => attachAudio(remoteId, remote));
      p.on('connect', () => store.getState().setPeer(remoteId, true));
      p.on('close', () => removePeer(remoteId));
      p.on('error', () => removePeer(remoteId));
      return p;
    },
    [tableId, attachAudio, removePeer, store],
  );

  // Socket signaling listeners are active for the whole hook lifetime.
  useEffect(() => {
    if (!tableId || !selfUserId) return;
    const s = getSocket();
    const onJoined = (d: { tableId: string; userId: string }) => {
      if (d.tableId !== tableId || d.userId === selfUserId || !store.getState().enabled) return;
      if (selfUserId < d.userId) createPeer(d.userId, true);
    };
    const onLeft = (d: { tableId: string; userId: string }) => {
      if (d.tableId === tableId) removePeer(d.userId);
    };
    const onOffer = (d: { fromUserId: string; sdp: string }) => {
      let p = peers.current.get(d.fromUserId);
      if (!p) p = createPeer(d.fromUserId, false);
      p.signal(JSON.parse(d.sdp));
    };
    const onAnswer = (d: { fromUserId: string; sdp: string }) => {
      peers.current.get(d.fromUserId)?.signal(JSON.parse(d.sdp));
    };
    const onIce = (d: { fromUserId: string; candidate: string }) => {
      peers.current.get(d.fromUserId)?.signal(JSON.parse(d.candidate));
    };
    s.on('voice:peer-joined', onJoined);
    s.on('voice:peer-left', onLeft);
    s.on('voice:offer', onOffer);
    s.on('voice:answer', onAnswer);
    s.on('voice:ice-candidate', onIce);
    return () => {
      s.off('voice:peer-joined', onJoined);
      s.off('voice:peer-left', onLeft);
      s.off('voice:offer', onOffer);
      s.off('voice:answer', onAnswer);
      s.off('voice:ice-candidate', onIce);
    };
  }, [tableId, selfUserId, createPeer, removePeer, store]);

  const enable = useCallback(async () => {
    if (!tableId || !selfUserId || store.getState().enabled) return;
    // getUserMedia only exists in a secure context (HTTPS or localhost).
    if (!navigator.mediaDevices?.getUserMedia) {
      toast.error('语音需要 HTTPS 安全连接才能使用麦克风（当前为 HTTP）');
      return;
    }
    try {
      stream.current = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
      const res = await emitAck<{ iceServers: IceServerConfig[]; peers: string[] }>('voice:join', { tableId });
      ice.current = res.iceServers;
      store.getState().setEnabled(true);
      store.getState().setMuted(false);
      // We initiate to existing peers with a higher userId.
      for (const p of res.peers) if (selfUserId < p) createPeer(p, true);
    } catch (e) {
      stream.current?.getTracks().forEach((t) => t.stop());
      stream.current = null;
      toast.error(e instanceof Error ? e.message : 'mic failed');
    }
  }, [tableId, selfUserId, createPeer, store]);

  const disable = useCallback(() => {
    if (tableId) getSocket().emit('voice:leave', { tableId });
    for (const id of [...peers.current.keys()]) removePeer(id);
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
    store.getState().reset();
  }, [tableId, removePeer, store]);

  const toggleMute = useCallback(() => {
    const muted = !store.getState().muted;
    stream.current?.getAudioTracks().forEach((t) => (t.enabled = !muted));
    store.getState().setMuted(muted);
  }, [store]);

  // Tear down on unmount / table change.
  useEffect(() => () => disable(), [disable]);

  return { enable, disable, toggleMute };
}
