// SPDX-License-Identifier: 0BSD

// Effects routing algorithms, data the way an FM synth's operator algorithms
// are data. Each lists, per pedal slot and for `out`, which sources feed it.
// `in` is the mono send bus; a letter is another slot's output. The host graph
// builder and the offline renderer both read this, so a new topology is just a
// new entry here plus its picker icon.
//
// Slots are A B C D, index 0..3. Signal enters at in1 and leaves at out1.
export const SLOTS = ['A', 'B', 'C', 'D'];
export const slotIndex = { A: 0, B: 1, C: 2, D: 3 };

export const algorithms = [
  // Default series chain: out1 <- A <- B <- C <- D <- in1.
  {
    id: 'series',
    label: 'Series',
    edges: { D: ['in'], C: ['D'], B: ['C'], A: ['B'], out: ['A'] },
  },
];

export function algoById(id) {
  return algorithms.find((a) => a.id === id) || algorithms[0];
}

// The order to run the pedals in when processing a buffer serially (offline):
// start at the pedal fed by `in`, follow the single chain to `out`. Falls back
// to input-side-first D,C,B,A, which is the series order.
export function chainOrder(algorithm) {
  const edges = algorithm.edges || {};
  // Follow a linear chain from the slot fed by 'in'.
  const feeder = {}; // slot -> the slot (or 'in') that feeds it
  for (const slot of SLOTS) {
    const from = edges[slot] && edges[slot][0];
    if (from) feeder[slot] = from;
  }
  let start = SLOTS.find((s) => feeder[s] === 'in');
  if (!start) return [3, 2, 1, 0];
  const order = [];
  const nextOf = (src) => SLOTS.find((s) => feeder[s] === src);
  let cur = start;
  const seen = new Set();
  while (cur && !seen.has(cur)) {
    seen.add(cur);
    order.push(slotIndex[cur]);
    cur = nextOf(cur);
  }
  return order.length ? order : [3, 2, 1, 0];
}
