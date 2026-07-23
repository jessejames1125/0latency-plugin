'use strict';
// Change-triggered frame capture (Phase 11 T043/T044). Pure, dependency-free, and dual-loadable:
// CommonJS for node --test, browser global (window.FrameDiff) for capture.html — same code, no
// drift. The browser downscales each ~1/s video sample to an 8x8 grayscale array; this module
// decides whether that sample is a material change worth keeping, collapsing a static screen from
// ~3600 samples/hr to a handful. Importance is recovered later from transcript alignment, not a
// keypress (supersedes the v0 hotkey-only decision; see meeting-pipeline-v0-spec §3.3).

// 64-bit average hash from a length-N grayscale array (0-255). Bit i set iff pixel i >= the mean.
function avgHash(gray) {
  let sum = 0;
  for (let i = 0; i < gray.length; i++) sum += gray[i];
  const mean = sum / gray.length;
  const bits = new Uint8Array(gray.length);
  for (let i = 0; i < gray.length; i++) bits[i] = gray[i] >= mean ? 1 : 0;
  return bits;
}

// Hamming distance between two equal-length bit arrays.
function hamming(a, b) {
  let d = 0;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) d++;
  return d;
}

// Stateful keeper. cfg: { changeThreshold (bits, default 10), minIntervalMs (default 2000) }.
// consider() returns true when a sample is worth keeping: always the first, thereafter only when
// it differs from the last KEPT frame by >= changeThreshold bits AND at least minIntervalMs has
// elapsed since the last kept frame. A dropped sample does not become the new baseline.
function createChangeDetector(cfg = {}) {
  const changeThreshold = cfg.changeThreshold != null ? cfg.changeThreshold : 10;
  const minIntervalMs = cfg.minIntervalMs != null ? cfg.minIntervalMs : 2000;
  let lastHash = null;
  let lastKeptMs = -Infinity;
  return {
    consider(gray, nowMs) {
      const hash = avgHash(gray);
      if (lastHash === null) { lastHash = hash; lastKeptMs = nowMs; return true; }
      if (nowMs - lastKeptMs < minIntervalMs) return false;
      if (hamming(hash, lastHash) < changeThreshold) return false;
      lastHash = hash; lastKeptMs = nowMs; return true;
    },
  };
}

const api = { avgHash, hamming, createChangeDetector };
if (typeof module !== 'undefined' && module.exports) module.exports = api;
if (typeof window !== 'undefined') window.FrameDiff = api;
