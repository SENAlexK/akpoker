/** Minimal types for @thaunknown/simple-peer (maintained ESM fork, no bundled types). */
declare module '@thaunknown/simple-peer' {
  export interface PeerOptions {
    initiator?: boolean;
    stream?: MediaStream;
    trickle?: boolean;
    config?: RTCConfiguration;
  }
  export default class Peer {
    constructor(opts?: PeerOptions);
    signal(data: unknown): void;
    on(event: 'signal', cb: (data: unknown) => void): this;
    on(event: 'stream', cb: (stream: MediaStream) => void): this;
    on(event: 'connect', cb: () => void): this;
    on(event: 'close', cb: () => void): this;
    on(event: 'error', cb: (err: Error) => void): this;
    destroy(): void;
    readonly destroyed: boolean;
  }
}
