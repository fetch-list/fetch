// Hybrid logical clock (Kulkarni et al. 2014): wall-clock time plus a counter plus a node id.
// It never runs backwards on one device, moves past every timestamp it has seen,
// and gives a total order without ties because the node id breaks them.

// Timestamp string: <ms base36, 9 chars>:<counter base36, 4 chars>:<node id>.
// The fixed widths make plain string comparison equal to (ms, counter, node) ordering.
export const HLC_RE = /^[0-9a-z]{9}:[0-9a-z]{4}:[\w-]{1,40}$/;

const pack = (ms, counter, node) =>
  ms.toString(36).padStart(9, '0') + ':' + counter.toString(36).padStart(4, '0') + ':' + node;

export const hlcMillis = (hlc) => parseInt(hlc.slice(0, 9), 36);

export class Clock {
  constructor(node, last = '') {
    this.node = node;
    this.ms = 0;
    this.counter = 0;
    if (last) this.observe(last);
  }

  // Timestamp for a local write. Never goes backwards, even if the wall clock does.
  now(wall = Date.now()) {
    if (wall > this.ms) {
      this.ms = wall;
      this.counter = 0;
    } else {
      this.counter++;
    }
    return pack(this.ms, this.counter, this.node);
  }

  // Advance past a timestamp seen from another replica.
  observe(hlc) {
    const ms = hlcMillis(hlc);
    const counter = parseInt(hlc.slice(10, 14), 36);
    if (ms > this.ms || (ms === this.ms && counter > this.counter)) {
      this.ms = ms;
      this.counter = counter;
    }
  }

  toString() {
    return pack(this.ms, this.counter, this.node);
  }
}
