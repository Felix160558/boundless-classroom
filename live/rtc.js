// Perfect negotiation, without third-party signaling, STUN, TURN or media capture.
// Media capture is an explicit user gesture in live.js. This class owns the peer only.
export class ClassroomPeer {
  constructor({polite, iceServers = [], send, onStream, onState, onError, PeerConnection = globalThis.RTCPeerConnection, Stream = globalThis.MediaStream}) {
    this.closed = false; this.polite = polite; this.send = send; this.onError = onError;
    this.makingOffer = false; this.ignoreOffer = false; this.settingAnswer = false; this.candidates = [];
    this.pc = new PeerConnection({iceServers});
    this.remote = new Stream();
    // Wait for actual capture instead of negotiating empty media sections on
    // entry. addTrack can reuse receive transceivers created by the offer,
    // avoiding the extra send/receive sections seen with eager transceivers.
    this.senders = new Map();
    this.pc.ontrack = ({track}) => { if (!this.remote.getTracks().some(t => t.id === track.id)) this.remote.addTrack(track); onStream(this.remote); };
    this.pc.onconnectionstatechange = () => { if (!this.closed) onState(this.pc.connectionState); };
    this.pc.onicecandidate = ({candidate}) => { if (candidate && !this.closed) this.send({candidate:candidate.toJSON()}).catch(e => this.fail(e)); };
    this.pc.onnegotiationneeded = async () => {
      try { this.makingOffer = true; await this.pc.setLocalDescription(); if (!this.closed) await this.send({description:{type:this.pc.localDescription.type,sdp:this.pc.localDescription.sdp}}); }
      catch (e) { this.fail(e); } finally { this.makingOffer = false; }
    };
    this.queue = Promise.resolve();
    this.streamQueue = Promise.resolve(); this.streamRevision = 0;
  }
  fail(error) { if (!this.closed) this.onError(error); }
  setStream(stream) {
    const revision = ++this.streamRevision;
    const tracks = ['audio', 'video'].map(kind => [kind, stream?.getTracks().find(t => t.kind === kind) ?? null]);
    // A delayed start must not restore a stopped track after the user turns
    // devices off. Serialize replacements; only the newest request continues.
    const update = this.streamQueue.then(async () => {
      for (const [kind, track] of tracks) {
        if (this.closed || revision !== this.streamRevision) return;
        const sender = this.senders.get(kind);
        if (sender) await sender.replaceTrack(track);
        else if (track) this.senders.set(kind, this.pc.addTrack(track, stream));
      }
    });
    this.streamQueue = update.catch(() => {});
    return update;
  }
  receive(message) {
    this.queue = this.queue.then(() => this.apply(message)).catch(e => this.fail(e));
    return this.queue;
  }
  async apply({description, candidate}) {
    if (this.closed) return;
    if (description) {
      const ready = !this.makingOffer && (this.pc.signalingState === 'stable' || this.settingAnswer);
      const collision = description.type === 'offer' && !ready;
      this.ignoreOffer = !this.polite && collision;
      if (this.ignoreOffer) return;
      this.settingAnswer = description.type === 'answer';
      try { await this.pc.setRemoteDescription(description); } finally { this.settingAnswer = false; }
      if (this.closed) return;
      for (const queued of this.candidates.splice(0)) await this.pc.addIceCandidate(queued);
      if (description.type === 'offer') {
        await this.pc.setLocalDescription();
        if (!this.closed) await this.send({description:{type:this.pc.localDescription.type,sdp:this.pc.localDescription.sdp}});
      }
    } else if (candidate && !this.ignoreOffer) {
      if (!this.pc.remoteDescription) { if (this.candidates.length < 128) this.candidates.push(candidate); }
      else await this.pc.addIceCandidate(candidate);
    }
  }
  close() { this.closed = true; this.candidates = []; this.pc.close(); this.remote.getTracks().forEach(t => t.stop()); }
}
