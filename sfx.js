// --- SOUND EFFECTS & PROCEDURAL AUDIO ---
import * as THREE from 'three';
import {ChillFlightLogic} from './chill-flight-logic.js';
import {state} from './state.js';
import {activePlaneType, planeGroup} from './airplane.js';
import {UNLOCK_EVENTS, musicEnabled} from './audio.js';
import {log} from './logger.js';
import {PLANE_HANDLING} from './constants.js';
import {simplex} from './noise.js';

// ?sfx=0/1 overrides the saved setting for this visit (and changes made
// during it aren't saved). With no saved setting, sound effects follow the
// music setting, so players who chose to start silently stay silent.
function savedSfxEnabled() {
  try {
    const saved = localStorage.getItem('chill_flight_sfx_enabled');
    if (saved !== null) return saved !== 'false';
    return localStorage.getItem('chill_flight_music_enabled') !== 'false';
  } catch {
    return true;
  }
}
export let sfxEnabled =
  ChillFlightLogic.SFX_PARAM !== null
    ? ChillFlightLogic.SFX_PARAM
    : savedSfxEnabled();

// Top of the speed range in flightSpeedMultiplier units (500 kts)
const MAX_SPEED_MULT = 500 / 150;
const BUGGY_TOP_SPEED_MULT = PLANE_HANDLING.buggy.topKts / 150;
// Depth of the propeller chop (amplitude wobble from the LFO)
const CHOP_DEPTH = 0.3;
// Engine level while music is on (0.25 = -12 dB): the engine's steady drone
// fights the music at full level, so it sits well underneath it instead
const ENGINE_MUSIC_DUCK = 0.25;
// Overall engine level for every plane and the buggy, music or not. Muted for
// now (the engine code is kept): set it back to restore the engine sounds
const ENGINE_LEVEL = 0;
// Wind rush level (0.5 = -6 dB). With the engine muted the wind is heard on
// its own, so it sits lower, and its pitch rises only gently with speed so
// it stays a soft rush instead of a hiss
const WIND_LEVEL = 0.5;

// Master SFX volume relative to music (which plays at 0.5)
export const SFX_VOLUME = 0.45;
export let masterVolume = 0.45;

// Optional override for debug auditioning
export let planeTypeOverride = null;

export function setPlaneTypeOverride(type) {
  planeTypeOverride = type;
}

let audioCtx = null;
let masterGain = null;
let engineGain = null;
let engineFilter = null;
let raspFilter = null;
let raspGain = null;
let chopGain = null;
let osc1 = null;
let osc2 = null;
let oscSub = null;
let oscSubGain = null;
let lfo = null;
let lfoGain = null;
let windGain = null;
// The wind's movement: last frame's time, height and speed, the smoothed
// sink rate and speed change, and the swell they set off (0-1)
let lastWindTime = null;
let lastWindY = 0;
let lastWindSpeed = 0;
let windSwell = 0;
let windSink = 0;
let windSpeedRate = 0;
let windFilter = null;
let windSource = null;
let cricketGain = null;
let cricketSource = null;
let breezeGain = null;
let breezeFilter = null;
let breezeSource = null;
let frogGain = null;
let frogSource = null;
let isInitialized = false;

/**
 * Generates a smooth, looping pink/brown noise buffer for wind rush.
 * Six seconds long so the loop isn't heard as a cycle, and the noise past
 * the end is faded into the start so the loop point has no click.
 */
function createNoiseBuffer(context) {
  const bufferSize = context.sampleRate * 6;
  const fadeLen = Math.floor(context.sampleRate * 0.25);
  const buffer = context.createBuffer(1, bufferSize, context.sampleRate);
  const output = buffer.getChannelData(0);
  const tail = new Float32Array(fadeLen);
  let b0 = 0;
  let b1 = 0;
  let b2 = 0;
  for (let i = 0; i < bufferSize + fadeLen; i++) {
    const white = Math.random() * 2 - 1;
    b0 = 0.99 * b0 + white * 0.05;
    b1 = 0.95 * b1 + white * 0.1;
    b2 = 0.85 * b2 + white * 0.2;
    const v = (b0 + b1 + b2) * 0.6;
    if (i < bufferSize) output[i] = v;
    else tail[i - bufferSize] = v;
  }
  // The sample after the last one is tail[0], so blend the start from the
  // tail (continuing the end) into the original start.
  for (let i = 0; i < fadeLen; i++) {
    const alpha = i / fadeLen;
    output[i] = output[i] * alpha + tail[i] * (1 - alpha);
  }
  return buffer;
}

/**
 * Generates a peaceful, sleepy stereo looping buffer of tree crickets
 * chirping softly in the meadow at night and dusk.
 */
function createCricketBuffer(
  context,
  {pitchA = 2520, pitchB = 2740, rate = 1} = {}
) {
  // Long enough, with the calls at uneven times, that the pattern isn't
  // heard repeating
  const duration = 24;
  const sampleRate = context.sampleRate;
  const totalSamples = sampleRate * duration;
  const buffer = context.createBuffer(2, totalSamples, sampleRate);
  const left = buffer.getChannelData(0);
  const right = buffer.getChannelData(1);

  // Seeded so every load sounds the same
  let seed = 16807;
  const rand = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  // Call start times about `every` seconds apart, give or take, kept clear
  // of the loop's crossfade at the end
  const callTimes = (first, every) => {
    const times = [];
    for (let t = first; t < duration - 1; t += every * (0.6 + 0.9 * rand())) {
      times.push(t);
    }
    return times;
  };

  const rateScale = 1 / Math.max(0.4, rate);
  // Warm, mellow snowy-tree-cricket pitches (~2.4-2.7 kHz) with sparse,
  // unhurried calls and plenty of quiet evening air in between
  const crickets = [
    {
      freq: pitchA,
      gain: 0.16,
      pan: -0.45,
      times: callTimes(0.7, 3.2),
      pulses: 4,
      len: 0.028 * rateScale,
      gap: 0.048 * rateScale,
    },
    {
      freq: pitchB,
      gain: 0.12,
      pan: 0.5,
      times: callTimes(2.2, 4.4),
      pulses: 3,
      len: 0.026 * rateScale,
      gap: 0.046 * rateScale,
    },
    {
      freq: pitchA * 0.94,
      gain: 0.08,
      pan: 0.15,
      times: callTimes(3.3, 4.6),
      pulses: 3,
      len: 0.03 * rateScale,
      gap: 0.052 * rateScale,
    },
  ];

  for (const c of crickets) {
    const leftGain = c.gain * (1 - c.pan) * 0.5;
    const rightGain = c.gain * (1 + c.pan) * 0.5;
    for (const st of c.times) {
      // Each call a syllable longer or shorter and a little louder or softer
      const pulses = Math.max(2, c.pulses + Math.round(rand() * 2 - 1));
      const callGain = 0.75 + 0.35 * rand();
      for (let p = 0; p < pulses; p++) {
        // Gentle phrase swell across the syllables so chirps ease in and trail off
        const phraseFrac = pulses > 1 ? p / (pulses - 1) : 0.5;
        const phraseEnv =
          (0.55 + 0.45 * Math.sin(phraseFrac * Math.PI)) * callGain;
        // Subtle natural pitch settle across the phrase
        const pulseFreq = c.freq * (1 - 0.012 * phraseFrac);
        const pStart = st + p * c.gap;
        const startSample = Math.floor(pStart * sampleRate);
        const pulseSamples = Math.floor(c.len * sampleRate);
        for (let i = 0; i < pulseSamples; i++) {
          const idx = (startSample + i) % totalSamples;
          const t = i / sampleRate;
          // Raised-cosine (Hann) syllable envelope for soft, click-free edges
          const env =
            0.5 * (1 - Math.cos((2 * Math.PI * i) / pulseSamples)) * phraseEnv;
          const carrier = Math.sin(2 * Math.PI * pulseFreq * t);
          left[idx] += carrier * env * leftGain;
          right[idx] += carrier * env * rightGain;
        }
      }
    }
  }

  // Seamless crossfade loop
  const fadeLen = 4096;
  for (let i = 0; i < fadeLen; i++) {
    const alpha = i / fadeLen;
    const endIdx = totalSamples - fadeLen + i;
    left[i] = left[i] * alpha + left[endIdx] * (1 - alpha);
    right[i] = right[i] * alpha + right[endIdx] * (1 - alpha);
  }

  return buffer;
}

/**
 * Generates a peaceful stereo looping buffer of soft meadow breeze
 * when parked on land during the day. Twenty seconds long, with gusts from
 * several slow swells that all repeat exactly over the loop, so the gusts
 * come at uneven times and the loop point is seamless.
 */
function createBreezeBuffer(context) {
  const duration = 20;
  const sampleRate = context.sampleRate;
  const totalSamples = sampleRate * duration;
  const fadeLen = Math.floor(sampleRate * 0.25);
  const buffer = context.createBuffer(2, totalSamples, sampleRate);
  const left = buffer.getChannelData(0);
  const right = buffer.getChannelData(1);
  const tailL = new Float32Array(fadeLen);
  const tailR = new Float32Array(fadeLen);

  // Deterministic seeded pseudo-random noise generator with zero DC offset
  let seedL = 48271;
  let seedR = 982451;
  const nextL = () => {
    seedL = (seedL * 16807) % 2147483647;
    return seedL / 1073741824 - 1;
  };
  const nextR = () => {
    seedR = (seedR * 16807) % 2147483647;
    return seedR / 1073741824 - 1;
  };

  // A swell from sines that each fit a whole number of times into the loop
  // (cycles, depth, phase): uneven gusts that still meet up at the seam
  const swellOf = (parts) => (t) => {
    let v = 0;
    for (const [cycles, depth, phase] of parts) {
      v += depth * Math.sin((2 * Math.PI * cycles * t) / duration + phase);
    }
    return v;
  };
  const swellL = swellOf([
    [3, 0.22, 0],
    [5, 0.16, 1.3],
    [8, 0.1, 2.1],
    [13, 0.05, 0.4],
  ]);
  const swellR = swellOf([
    [3, 0.2, 0.9],
    [4, 0.16, 2.6],
    [7, 0.1, 0.2],
    [11, 0.05, 1.7],
  ]);
  const rustleSwellL = swellOf([
    [3, 0.35, 0.4],
    [14, 0.25, 0],
    [9, 0.15, 2.4],
  ]);
  const rustleSwellR = swellOf([
    [3, 0.35, 1.2],
    [12, 0.25, 0.7],
    [10, 0.15, 1.1],
  ]);

  let bz0L = 0;
  let bz1L = 0;
  let bz2L = 0;
  let bz0R = 0;
  let bz1R = 0;
  let bz2R = 0;
  let r0L = 0;
  let r1L = 0;
  let r0R = 0;
  let r1R = 0;

  for (let i = 0; i < totalSamples + fadeLen; i++) {
    const t = i / sampleRate;
    const wL1 = nextL();
    const wR1 = nextR();
    const wL2 = nextL();
    const wR2 = nextR();

    // Warm pink noise for wind body
    bz0L = 0.995 * bz0L + wL1 * 0.05;
    bz1L = 0.95 * bz1L + wL1 * 0.1;
    bz2L = 0.85 * bz2L + wL1 * 0.2;
    bz0R = 0.995 * bz0R + wR1 * 0.05;
    bz1R = 0.95 * bz1R + wR1 * 0.1;
    bz2R = 0.85 * bz2R + wR1 * 0.2;

    const lowNoiseL = (bz0L + bz1L + bz2L) * 0.5;
    const lowNoiseR = (bz0R + bz1R + bz2R) * 0.5;

    // Subtle meadow grass / foliage rustle
    r0L = 0.8 * r0L + wL2 * 0.2;
    r1L = 0.6 * r1L + (wL2 - r0L) * 0.2;
    r0R = 0.8 * r0R + wR2 * 0.2;
    r1R = 0.6 * r1R + (wR2 - r0R) * 0.2;

    const rustleL = r1L * Math.pow(Math.max(0, 0.3 + rustleSwellL(t)), 1.5);
    const rustleR = r1R * Math.pow(Math.max(0, 0.3 + rustleSwellR(t)), 1.5);

    const l =
      lowNoiseL * Math.max(0.05, 0.5 + swellL(t)) * 0.75 + rustleL * 0.25;
    const r =
      lowNoiseR * Math.max(0.05, 0.5 + swellR(t)) * 0.75 + rustleR * 0.25;
    if (i < totalSamples) {
      left[i] = l;
      right[i] = r;
    } else {
      tailL[i - totalSamples] = l;
      tailR[i - totalSamples] = r;
    }
  }

  // Seamless loop: the sample after the last is the tail's first, so blend
  // the start from the tail (continuing the end) into the original start
  for (let i = 0; i < fadeLen; i++) {
    const alpha = i / fadeLen;
    left[i] = left[i] * alpha + tailL[i] * (1 - alpha);
    right[i] = right[i] * alpha + tailR[i] * (1 - alpha);
  }

  return buffer;
}

/**
 * Generates a stereo looping buffer of mellow bayou bullfrog and tree-frog
 * calls when parked or idling in the swamp.
 */
function createFrogBuffer(context) {
  const duration = 24;
  const sampleRate = context.sampleRate;
  const totalSamples = sampleRate * duration;
  const buffer = context.createBuffer(2, totalSamples, sampleRate);
  const left = buffer.getChannelData(0);
  const right = buffer.getChannelData(1);

  let seed = 31337;
  const rand = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  const callTimes = (first, every) => {
    const times = [];
    for (
      let t = first;
      t < duration - 1.2;
      t += every * (0.65 + 0.85 * rand())
    ) {
      times.push(t);
    }
    return times;
  };

  const frogs = [
    // Deep bullfrog two-note jug-o-rum croaks
    {
      f0: 138,
      f1: 162,
      trillHz: 36,
      gain: 0.14,
      pan: -0.5,
      times: callTimes(1.1, 6.2),
      notes: 2,
      len: 0.24,
      gap: 0.34,
    },
    {
      f0: 152,
      f1: 176,
      trillHz: 40,
      gain: 0.11,
      pan: 0.55,
      times: callTimes(3.4, 7.5),
      notes: 2,
      len: 0.21,
      gap: 0.31,
    },
    // Higher woody tree-frog chirps
    {
      f0: 560,
      f1: 680,
      trillHz: 52,
      gain: 0.08,
      pan: 0.2,
      times: callTimes(0.6, 4.3),
      notes: 2,
      len: 0.085,
      gap: 0.15,
    },
  ];

  for (const f of frogs) {
    const leftGain = f.gain * (1 - f.pan) * 0.5;
    const rightGain = f.gain * (1 + f.pan) * 0.5;
    for (const st of f.times) {
      const callGain = 0.75 + 0.3 * rand();
      for (let n = 0; n < f.notes; n++) {
        const noteStart = st + n * f.gap;
        const startSample = Math.floor(noteStart * sampleRate);
        const noteSamples = Math.floor(f.len * sampleRate);
        let phase = 0;
        for (let i = 0; i < noteSamples; i++) {
          const idx = (startSample + i) % totalSamples;
          const frac = i / noteSamples;
          const env = Math.sin(frac * Math.PI) * (1 - 0.25 * frac) * callGain;
          const trill =
            0.65 + 0.35 * Math.sin(2 * Math.PI * f.trillHz * (i / sampleRate));
          const freq = f.f0 + (f.f1 - f.f0) * Math.sin(frac * Math.PI * 0.85);
          phase += (2 * Math.PI * freq) / sampleRate;
          const carrier =
            0.65 * Math.sin(phase) +
            0.25 * Math.sin(phase * 2) +
            0.1 * Math.sin(phase * 3);
          const sample = carrier * env * trill;
          left[idx] += sample * leftGain;
          right[idx] += sample * rightGain;
        }
      }
    }
  }

  const fadeLen = 4096;
  for (let i = 0; i < fadeLen; i++) {
    const alpha = i / fadeLen;
    const endIdx = totalSamples - fadeLen + i;
    left[i] = left[i] * alpha + left[endIdx] * (1 - alpha);
    right[i] = right[i] * alpha + right[endIdx] * (1 - alpha);
  }

  return buffer;
}

let suspendTimer = null;
let wasActive = false;
let isBackgrounded = false;

function isSfxActive() {
  return (
    sfxEnabled &&
    !state.isPaused &&
    !isBackgrounded &&
    (typeof document === 'undefined' || document.visibilityState !== 'hidden')
  );
}

/**
 * Runs the audio context only while sound effects are on, the game is
 * unpaused, and the app/page is in the foreground. Ramps masterGain to zero
 * on the audio thread before suspending so oscillators never cut mid-waveform.
 */
export function syncSfxState() {
  if (!audioCtx || !masterGain) return;
  clearTimeout(suspendTimer);
  suspendTimer = null;
  const active = isSfxActive();
  const now = audioCtx.currentTime;

  if (active) {
    if (!wasActive) {
      wasActive = true;
      masterGain.gain.cancelScheduledValues(now);
      masterGain.gain.setValueAtTime(masterGain.gain.value, now);
      masterGain.gain.setTargetAtTime(masterVolume, now, 0.05);
    }
    if (audioCtx.state === 'suspended' || audioCtx.state === 'interrupted') {
      audioCtx.resume().catch(() => {});
    }
  } else {
    if (wasActive) {
      wasActive = false;
      masterGain.gain.cancelScheduledValues(now);
      masterGain.gain.setValueAtTime(masterGain.gain.value, now);
      masterGain.gain.linearRampToValueAtTime(0, now + 0.015);
    }
    if (audioCtx.state === 'running') {
      suspendTimer = setTimeout(() => {
        suspendTimer = null;
        if (audioCtx && !isSfxActive() && audioCtx.state === 'running') {
          audioCtx.suspend().catch(() => {});
        }
      }, 25);
    }
  }
}

export function setSfxBackgrounded(backgrounded) {
  isBackgrounded = !!backgrounded;
  syncSfxState();
}

export function setSfxVolume(vol) {
  masterVolume = THREE.MathUtils.clamp(vol, 0, 1);
  if (audioCtx && masterGain && isSfxActive() && audioCtx.state === 'running') {
    const now = audioCtx.currentTime;
    masterGain.gain.cancelScheduledValues(now);
    masterGain.gain.setValueAtTime(masterGain.gain.value, now);
    masterGain.gain.setTargetAtTime(masterVolume, now, 0.05);
  }
  syncSfxState();
}

// Buffers generated ahead on the loading screen (prebakeSfxBuffers), so
// starting the game only copies them: generating them all inside the START
// tap held it up by ~600 ms. Made at 48 kHz; an AudioBuffer can have its own
// rate, so a context at another rate (44.1 kHz is common) plays them
// resampled rather than generating its own. Name -> channel data
const PREBAKE_RATE = 48000;
const prebaked = new Map();

// Stands in for an AudioContext so the generators fill plain arrays
function arrayContext(sampleRate) {
  return {
    sampleRate,
    createBuffer(channels, length) {
      const data = Array.from(
        {length: channels},
        () => new Float32Array(length)
      );
      return {data, getChannelData: (i) => data[i]};
    },
  };
}

export function prebakeSfxBuffers() {
  if (isInitialized || prebaked.size > 0) return;
  const context = arrayContext(PREBAKE_RATE);
  prebaked.set('wind', createNoiseBuffer(context).data);
  prebaked.set('crickets', createCricketBuffer(context).data);
  prebaked.set('breeze', createBreezeBuffer(context).data);
  prebaked.set('frogs', createFrogBuffer(context).data);
  prebaked.set('eventNoise', createNoiseBuffer(context).data);
}

// The prebaked buffer `name` (each is used once), or make(context) if there
// isn't one
export function prebakedBuffer(name, context, make) {
  const data = prebaked.get(name);
  prebaked.delete(name);
  if (!data) return make(context);
  const buffer = context.createBuffer(
    data.length,
    data[0].length,
    PREBAKE_RATE
  );
  data.forEach((channel, i) => buffer.copyToChannel(channel, i));
  return buffer;
}

/**
 * Initializes the Web Audio graph for sound effects.
 * Safe to call repeatedly; initializes only once.
 */
export function initAudioContext() {
  if (isInitialized || typeof window === 'undefined') {
    syncSfxState();
    return audioCtx;
  }

  const AudioContextClass = window.AudioContext;
  if (!AudioContextClass) return null;

  try {
    audioCtx = new AudioContextClass();

    // Master SFX Bus
    const active = isSfxActive();
    wasActive = active;
    masterGain = audioCtx.createGain();
    masterGain.gain.setValueAtTime(
      active ? masterVolume : 0,
      audioCtx.currentTime
    );
    masterGain.connect(audioCtx.destination);

    // --- Wind rush (Pink noise bandpass) ---
    windSource = audioCtx.createBufferSource();
    windSource.buffer = prebakedBuffer('wind', audioCtx, createNoiseBuffer);
    windSource.loop = true;

    windFilter = audioCtx.createBiquadFilter();
    windFilter.type = 'bandpass';
    windFilter.frequency.setValueAtTime(450, audioCtx.currentTime);
    windFilter.Q.setValueAtTime(0.85, audioCtx.currentTime);

    windGain = audioCtx.createGain();
    windGain.gain.setValueAtTime(0, audioCtx.currentTime);

    windSource.connect(windFilter);
    windFilter.connect(windGain);
    windGain.connect(masterGain);
    windSource.start(0);

    // --- Stopped land crickets ambiance (night/dusk) ---
    cricketSource = audioCtx.createBufferSource();
    cricketSource.buffer = prebakedBuffer(
      'crickets',
      audioCtx,
      createCricketBuffer
    );
    cricketSource.loop = true;

    cricketGain = audioCtx.createGain();
    cricketGain.gain.setValueAtTime(0, audioCtx.currentTime);

    cricketSource.connect(cricketGain);
    cricketGain.connect(masterGain);
    cricketSource.start(0);

    // --- Stopped land meadow breeze ambiance (daytime) ---
    breezeSource = audioCtx.createBufferSource();
    breezeSource.buffer = prebakedBuffer(
      'breeze',
      audioCtx,
      createBreezeBuffer
    );
    breezeSource.loop = true;

    breezeFilter = audioCtx.createBiquadFilter();
    breezeFilter.type = 'lowpass';
    breezeFilter.frequency.setValueAtTime(360, audioCtx.currentTime);
    breezeFilter.Q.setValueAtTime(0.7, audioCtx.currentTime);

    breezeGain = audioCtx.createGain();
    breezeGain.gain.setValueAtTime(0, audioCtx.currentTime);

    breezeSource.connect(breezeFilter);
    breezeFilter.connect(breezeGain);
    breezeGain.connect(masterGain);
    breezeSource.start(0);

    // --- Stopped swamp frog ambiance ---
    frogSource = audioCtx.createBufferSource();
    frogSource.buffer = prebakedBuffer('frogs', audioCtx, createFrogBuffer);
    frogSource.loop = true;

    frogGain = audioCtx.createGain();
    frogGain.gain.setValueAtTime(0, audioCtx.currentTime);

    frogSource.connect(frogGain);
    frogGain.connect(masterGain);
    frogSource.start(0);

    // --- Engine synthesis ---
    // Primary oscillator (sawtooth for rich harmonic body)
    osc1 = audioCtx.createOscillator();
    osc1.type = 'sawtooth';
    osc1.frequency.setValueAtTime(45, audioCtx.currentTime);

    // Secondary oscillator (triangle for mellow undertone / twin detune)
    osc2 = audioCtx.createOscillator();
    osc2.type = 'triangle';
    osc2.frequency.setValueAtTime(47, audioCtx.currentTime);

    // Sub-harmonic oscillator (sub-octave thrum)
    oscSub = audioCtx.createOscillator();
    oscSub.type = 'triangle';
    oscSub.frequency.setValueAtTime(22.5, audioCtx.currentTime);

    oscSubGain = audioCtx.createGain();
    oscSubGain.gain.setValueAtTime(0.4, audioCtx.currentTime);
    oscSub.connect(oscSubGain);

    // Warm low-pass filter to remove harsh digital frequencies
    engineFilter = audioCtx.createBiquadFilter();
    engineFilter.type = 'lowpass';
    engineFilter.frequency.setValueAtTime(180, audioCtx.currentTime);
    engineFilter.Q.setValueAtTime(1.5, audioCtx.currentTime);

    // Upper-mid "rasp" from the sawtooth's harmonics, so the engine still
    // carries on phone and laptop speakers that can't play the low body
    raspFilter = audioCtx.createBiquadFilter();
    raspFilter.type = 'bandpass';
    raspFilter.frequency.setValueAtTime(400, audioCtx.currentTime);
    raspFilter.Q.setValueAtTime(0.9, audioCtx.currentTime);
    raspGain = audioCtx.createGain();
    raspGain.gain.setValueAtTime(2, audioCtx.currentTime);

    engineGain = audioCtx.createGain();
    engineGain.gain.setValueAtTime(0, audioCtx.currentTime);

    // Propeller blade chop: the LFO wobbles chopGain around 1
    chopGain = audioCtx.createGain();
    chopGain.gain.setValueAtTime(1, audioCtx.currentTime);

    lfo = audioCtx.createOscillator();
    lfo.type = 'sine';
    lfo.frequency.setValueAtTime(9, audioCtx.currentTime);

    lfoGain = audioCtx.createGain();
    lfoGain.gain.setValueAtTime(CHOP_DEPTH, audioCtx.currentTime);
    lfo.connect(lfoGain);
    lfoGain.connect(chopGain.gain);

    osc1.connect(engineFilter);
    osc2.connect(engineFilter);
    oscSubGain.connect(engineFilter);
    osc1.connect(raspFilter);
    raspFilter.connect(raspGain);
    engineFilter.connect(chopGain);
    raspGain.connect(chopGain);
    chopGain.connect(engineGain);
    engineGain.connect(masterGain);

    osc1.start(0);
    osc2.start(0);
    oscSub.start(0);
    lfo.start(0);

    isInitialized = true;
    log.info('Sound effects audio graph initialized');
  } catch (err) {
    log.warn('Could not initialize audio context:', err);
    return null;
  }

  audioCtx.addEventListener('statechange', () => {
    if (audioCtx && audioCtx.state === 'running' && !isSfxActive()) {
      syncSfxState();
    }
  });

  // Resume suspended AudioContext on user interaction (autoplay policy).
  // Browsers only count some events as a gesture: a touch counts when it
  // ends (pointerup/touchend), not when it starts, so listen for both ends.
  const unlockAudio = () => syncSfxState();
  for (const type of UNLOCK_EVENTS) {
    window.addEventListener(type, unlockAudio, {passive: true});
  }
  // Gains only change from the frame loop, which stops in hidden tabs and
  // backgrounded apps, so ramp down and suspend the context there instead.
  document.addEventListener('visibilitychange', syncSfxState);
  window.addEventListener('pagehide', () => setSfxBackgrounded(true));
  window.addEventListener('pageshow', () => setSfxBackgrounded(false));
  syncSfxState();

  return audioCtx;
}

/**
 * Toggles or sets the sound effects enabled state.
 */
export function setSfxEnabled(enabled) {
  sfxEnabled = enabled;
  if (ChillFlightLogic.SFX_PARAM === null) {
    try {
      localStorage.setItem(
        'chill_flight_sfx_enabled',
        enabled ? 'true' : 'false'
      );
    } catch {
      /* ignore */
    }
  }

  const sfxToggle = document.getElementById('sfx-toggle-input');
  if (sfxToggle && sfxToggle.checked !== enabled) {
    sfxToggle.checked = enabled;
  }

  if (enabled && !isInitialized) {
    initAudioContext();
  }

  syncSfxState();
}

/**
 * Updates SFX synthesis parameters every frame based on plane speed and type.
 */
export function updateSfx() {
  if (!isInitialized || !audioCtx) return;

  const active = isSfxActive();
  if (active !== wasActive) {
    syncSfxState();
  }
  if (!active) return;

  const speed = Math.max(0, state.flightSpeedMultiplier || 0);
  const targetSpeed = Math.max(0, state.targetFlightSpeed || 0);
  const throttleFactor = THREE.MathUtils.clamp(targetSpeed / 2.5, 0, 1);
  const planeType = planeTypeOverride || activePlaneType;
  const isStopped = speed < 0.05 && targetSpeed === 0;
  const speedFrac = THREE.MathUtils.clamp(speed / MAX_SPEED_MULT, 0, 1);
  // Engine loudness keeps rising up to top speed instead of flattening out
  const engineDuck = (musicEnabled ? ENGINE_MUSIC_DUCK : 1) * ENGINE_LEVEL;
  raspGain.gain.setTargetAtTime(
    planeType === 'jet' ? 0 : 2,
    audioCtx.currentTime,
    0.05
  );
  const engineLoudness = (0.05 + 0.19 * Math.sqrt(speedFrac)) * engineDuck;

  // The flying wind moves instead of sitting as a flat hiss: slow gusts that
  // average out to its set level, and a swell while diving or speeding up or
  // slowing down quickly. A steady cruise stays calm
  // Frame time from the page clock, which follows the game's frames (the
  // audio clock moves in its own steps)
  const frameNow = performance.now() / 1000;
  const windDt =
    lastWindTime === null ? 0 : Math.min(0.1, frameNow - lastWindTime);
  lastWindTime = frameNow;
  const y = planeGroup.position.y;
  if (windDt > 0) {
    // Sink rate (units/s) and speed change (knots/s), smoothed
    const ease = Math.min(1, windDt * 4);
    windSink += ((lastWindY - y) / windDt - windSink) * ease;
    windSpeedRate +=
      ((Math.abs(speed - lastWindSpeed) * 150) / windDt - windSpeedRate) * ease;
    const swellTarget = Math.min(
      1,
      0.6 * THREE.MathUtils.clamp((windSink - 20) / 80, 0, 1) +
        0.4 * THREE.MathUtils.clamp((windSpeedRate - 5) / 40, 0, 1)
    );
    // Builds over a second or so and dies away more slowly
    const rate = swellTarget > windSwell ? 2.5 : 0.8;
    windSwell += (swellTarget - windSwell) * Math.min(1, windDt * rate);
  }
  lastWindY = y;
  lastWindSpeed = speed;
  const gust =
    1 +
    0.18 * Math.sin(2 * Math.PI * 0.071 * frameNow) +
    0.12 * Math.sin(2 * Math.PI * 0.173 * frameNow + 1.3);
  // Up to twice as loud (+6 dB) and a little brighter in a steep dive
  const windMove = gust * (1 + windSwell);
  const windBright = 1 + 0.3 * windSwell;

  // Stopped ambient soundscapes (crickets at night/dusk, meadow breeze by day, and frogs in the swamp)
  let targetCricketGain = 0;
  let targetBreezeGain = 0;
  let targetFrogGain = 0;

  if (isStopped && state.isOnGround) {
    // Transition from crickets (night/dusk) to meadow breeze (day) based on dayFactor
    // dayFactor: 0 = night, 1 = day
    const nightFactor = THREE.MathUtils.clamp(
      (0.55 - state.dayFactor) / 0.35,
      0,
      1
    );
    targetCricketGain = 0.28 * nightFactor;
    // 0.25 = 4 dB under where it was: it sat well above the flying wind
    targetBreezeGain = 0.25 * (1 - nightFactor * 0.7);
    const swamp = ChillFlightLogic.swampFactorAt(
      planeGroup.position.x,
      planeGroup.position.z,
      simplex
    );
    if (swamp > 0.15) {
      targetFrogGain = 0.25 * swamp * (0.45 + 0.55 * nightFactor);
    }
  }

  cricketGain.gain.setTargetAtTime(
    targetCricketGain,
    audioCtx.currentTime,
    0.8
  );
  breezeGain.gain.setTargetAtTime(targetBreezeGain, audioCtx.currentTime, 0.4);
  if (frogGain) {
    frogGain.gain.setTargetAtTime(targetFrogGain, audioCtx.currentTime, 0.8);
  }

  if (isStopped) {
    // Engine idles at low murmur when plane is parked (the jet is silent)
    engineGain.gain.setTargetAtTime(
      planeType === 'jet' ? 0 : 0.03 * engineDuck,
      audioCtx.currentTime,
      0.1
    );
    windGain.gain.setTargetAtTime(0, audioCtx.currentTime, 0.1);
    osc1.frequency.setTargetAtTime(36, audioCtx.currentTime, 0.1);
    osc2.frequency.setTargetAtTime(37.5, audioCtx.currentTime, 0.1);
    oscSub.frequency.setTargetAtTime(18, audioCtx.currentTime, 0.1);
    engineFilter.frequency.setTargetAtTime(130, audioCtx.currentTime, 0.1);
    raspFilter.frequency.setTargetAtTime(260, audioCtx.currentTime, 0.1);
    lfo.frequency.setTargetAtTime(5, audioCtx.currentTime, 0.1);
    return;
  }

  if (planeType === 'twin') {
    // Twin engine with acoustic beat frequency between props
    const f = 40 + speed * 26 + throttleFactor * 16;
    osc1.frequency.setTargetAtTime(f - 1.4, audioCtx.currentTime, 0.05);
    osc2.frequency.setTargetAtTime(f + 1.8, audioCtx.currentTime, 0.05);
    oscSub.frequency.setTargetAtTime(f * 0.5, audioCtx.currentTime, 0.05);
    lfo.frequency.setTargetAtTime(7 + speed * 6, audioCtx.currentTime, 0.05);

    const cutoff = 150 + speed * 160 + throttleFactor * 60;
    engineFilter.frequency.setTargetAtTime(cutoff, audioCtx.currentTime, 0.05);

    raspFilter.frequency.setTargetAtTime(f * 6, audioCtx.currentTime, 0.05);
    engineGain.gain.setTargetAtTime(
      engineLoudness * 1.05,
      audioCtx.currentTime,
      0.05
    );

    // Subtle wind rush
    windGain.gain.setTargetAtTime(
      speed * 0.06 * WIND_LEVEL * windMove,
      audioCtx.currentTime,
      0.05
    );
    windFilter.frequency.setTargetAtTime(
      (380 + speed * 110) * windBright,
      audioCtx.currentTime,
      0.05
    );
  } else if (planeType === 'buggy') {
    // A lumpy little car engine, revving up across the buggy's own speed
    // range rather than a plane's
    const revs = THREE.MathUtils.clamp(speed / BUGGY_TOP_SPEED_MULT, 0, 1);
    const f = 34 + revs * 42;
    osc1.frequency.setTargetAtTime(f, audioCtx.currentTime, 0.05);
    osc2.frequency.setTargetAtTime(f * 2, audioCtx.currentTime, 0.05);
    oscSub.frequency.setTargetAtTime(f * 0.5, audioCtx.currentTime, 0.05);
    lfo.frequency.setTargetAtTime(10 + revs * 10, audioCtx.currentTime, 0.05);
    engineFilter.frequency.setTargetAtTime(
      180 + revs * 300,
      audioCtx.currentTime,
      0.05
    );
    raspFilter.frequency.setTargetAtTime(f * 6, audioCtx.currentTime, 0.05);
    engineGain.gain.setTargetAtTime(
      (0.07 + 0.15 * Math.sqrt(revs)) * engineDuck,
      audioCtx.currentTime,
      0.05
    );
    windGain.gain.setTargetAtTime(
      speed * 0.03 * WIND_LEVEL * windMove,
      audioCtx.currentTime,
      0.05
    );
    // Its own tone (it used to keep whatever the last plane set), a little
    // darker than a plane's since the buggy is close to the ground
    windFilter.frequency.setTargetAtTime(
      (300 + speed * 90) * windBright,
      audioCtx.currentTime,
      0.05
    );
  } else if (planeType === 'jet') {
    // The jet is silent for now: its engine sound is muted, and the wind rush
    // below still plays
    engineGain.gain.setTargetAtTime(0, audioCtx.currentTime, 0.05);
    lfo.frequency.setTargetAtTime(0.5, audioCtx.currentTime, 0.05);

    // Air rushing past the intakes and canopy
    windGain.gain.setTargetAtTime(
      speed * 0.05 * WIND_LEVEL * windMove,
      audioCtx.currentTime,
      0.05
    );
    windFilter.frequency.setTargetAtTime(
      (380 + speed * 120) * windBright,
      audioCtx.currentTime,
      0.05
    );
  } else {
    // Single-engine prop plane (seaplane or biplane)
    const isBiplane = planeType === 'biplane';
    const f = (isBiplane ? 43 : 46) + speed * 28 + throttleFactor * 16;

    osc1.frequency.setTargetAtTime(f, audioCtx.currentTime, 0.05);
    osc2.frequency.setTargetAtTime(
      f * (isBiplane ? 1.5 : 1.02),
      audioCtx.currentTime,
      0.05
    );
    oscSub.frequency.setTargetAtTime(f * 0.5, audioCtx.currentTime, 0.05);
    lfo.frequency.setTargetAtTime(8 + speed * 7, audioCtx.currentTime, 0.05);

    const cutoff = (isBiplane ? 150 : 165) + speed * 180 + throttleFactor * 70;
    engineFilter.frequency.setTargetAtTime(cutoff, audioCtx.currentTime, 0.05);

    raspFilter.frequency.setTargetAtTime(f * 6, audioCtx.currentTime, 0.05);
    engineGain.gain.setTargetAtTime(engineLoudness, audioCtx.currentTime, 0.05);

    // Subtle wind rush
    windGain.gain.setTargetAtTime(
      speed * 0.05 * WIND_LEVEL * windMove,
      audioCtx.currentTime,
      0.05
    );
    windFilter.frequency.setTargetAtTime(
      (380 + speed * 100) * windBright,
      audioCtx.currentTime,
      0.05
    );
  }
}

/**
 * The sound effects bus (master gain) other sound modules connect to, or
 * null before the audio graph exists.
 */
export function getSfxBus() {
  return masterGain;
}

/**
 * Returns the active AudioContext instance (or null if not initialized).
 */
export function getAudioContext() {
  return audioCtx;
}

/**
 * Returns references to internal audio nodes for diagnostics and debug tools.
 */
export function getSfxNodes() {
  return {
    masterGain,
    engineGain,
    engineFilter,
    raspFilter,
    raspGain,
    chopGain,
    osc1,
    osc2,
    oscSub,
    oscSubGain,
    lfo,
    lfoGain,
    windGain,
    windFilter,
    windSource,
    cricketGain,
    cricketSource,
    breezeGain,
    breezeFilter,
    breezeSource,
    frogGain,
    frogSource,
  };
}

export function playBurnerSound() {
  if (!audioCtx || !masterGain) return;
  try {
    const bufferSize = audioCtx.sampleRate * 2;
    const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    const noise = audioCtx.createBufferSource();
    noise.buffer = buffer;

    const filter = audioCtx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(260, audioCtx.currentTime);
    filter.Q.setValueAtTime(1.2, audioCtx.currentTime);

    const gain = audioCtx.createGain();
    const now = audioCtx.currentTime;
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(0.08, now + 0.3);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 1.8);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(masterGain);

    noise.start(now);
    noise.stop(now + 1.9);
  } catch {
    /* ignore audio failures */
  }
}

export {
  createNoiseBuffer,
  createCricketBuffer,
  createBreezeBuffer,
  createFrogBuffer,
};

