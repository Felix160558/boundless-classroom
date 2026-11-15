// Server order is canonical. Locally pending strokes are never shown as saved.
export class BoardModel {
  constructor() { this.reset(0, []); }
  reset(epoch, strokes) { this.epoch = epoch; this.strokes = new Map(strokes.map(s => [s.id, s])); this.pending = new Map(); }
  adoptSnapshot(epoch, strokes) {
    if (epoch < this.epoch) return false;
    this.reset(epoch, strokes); return true;
  }
  addPending(stroke) { this.pending.set(stroke.id, stroke); }
  reject(id) { this.pending.delete(id); }
  accept(epoch, stroke) {
    if (epoch !== this.epoch) return false;
    this.pending.delete(stroke.id); this.strokes.set(stroke.id, stroke); return true;
  }
  clear(epoch) { if (epoch <= this.epoch) return false; this.reset(epoch, []); return true; }
  values() { return [...this.strokes.values(), ...this.pending.values()]; }
}
export function newRoomCode(cryptoProvider = globalThis.crypto) {
  // 32 characters, avoiding ambiguous 0/O/1/I. Masking gives no modulo bias.
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return [...cryptoProvider.getRandomValues(new Uint8Array(8))].map(n => alphabet[n & 31]).join('');
}
