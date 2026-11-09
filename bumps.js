// --- BUMPS ---
// Planes and buggies don't pass through each other: friends' planes, this
// player's bots and the air traffic all bump (bumps-logic.js has the
// maths). Each screen looks after its own: this player's plane or buggy is
// pushed off whatever it touched on this screen, and so are this player's
// bots and the traffic, while a friend's game pushes the friend. So there's
// nothing to send, and lag never leaves anyone stuck. Bumps are soft: a
// shove sideways, a little speed lost, a wobble, a thud and a puff; then
// the two pass through each other for a moment (BUMP.GHOST) so they don't
// stick.
import * as THREE from 'three';
import {state} from './state.js';
import {camera} from './sky.js';
import {activePlaneType, planeGroup} from './airplane.js';
import {hooks} from './hooks.js';
import {pushBuggy, slowBuggy} from './buggy.js';
import {forEachTrafficPlane} from './traffic.js';
import {forEachRoadCar} from './road-traffic.js';
import {bumpRoadCar} from './road-traffic-logic.js';
import {forEachBumpable} from './multiplayer.js';
import {propPuffs} from './particles.js';
import {playBump} from './sfx-events.js';
import {smashHaptic} from './haptics.js';
import {
  BUMP,
  bumpRadius,
  bumpRoll,
  fadePush,
  pushAway,
  touched,
} from './bumps-logic.js';

// A buggy's middle above where its wheels touch
const BUGGY_CENTER = 2;
// The camera's jolt for a bump (breakables.js uses 1.2 for a tree)
const SHAKE = 1;
// Bumps further off than this are heard more faintly, out to here (units)
const HEAR_RANGE = 700;
const PUFF = new THREE.Color(0.85, 0.85, 0.85);

// Where each thing was last frame, by key
const last = new Map();
// Pairs passing through each other after a bump: key -> until (s)
const ghosts = new Map();
// This player's push (units/s), fading
const myPush = new THREE.Vector3();
const _fwd = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _at = new THREE.Vector3();
const _push = {x: 0, y: 0, z: 0};
const _other = {x: 0, y: 0, z: 0};
let clock = 0;

// Something that can bump this frame: {key, a (last frame), b (now), r,
// heading, hit(push, roll), car} with hit null for a friend's plane (their own
// game pushes them) and car set for a buggy on the roads (road-traffic.js)
function bodies() {
  const out = [];
  const add = (key, x, y, z, r, heading, hit) => {
    const was = last.get(key);
    const b = {x, y, z};
    const body = {key, a: was || b, b, r, heading, hit};
    out.push(body);
    return body;
  };
  if (!state.isFreeCamera && state.airplaneModel) {
    const buggy = activePlaneType === 'buggy';
    const p = planeGroup.position;
    planeGroup.getWorldQuaternion(_q);
    _fwd.set(0, 0, -1).applyQuaternion(_q);
    add(
      'me',
      p.x,
      p.y + (buggy ? BUGGY_CENTER : 0),
      p.z,
      bumpRadius(buggy ? 'buggy' : 'plane'),
      Math.atan2(-_fwd.x, -_fwd.z),
      (push, roll) => bumpMe(push, roll, buggy)
    );
  }
  forEachBumpable((id, pos, buggy, bot) => {
    add(
      id,
      pos.x,
      pos.y + (buggy ? BUGGY_CENTER : 0),
      pos.z,
      bumpRadius(buggy ? 'buggy' : 'plane'),
      bot ? bot.heading : 0,
      bot ? (push, roll) => shove(bot, push, roll, buggy) : null
    );
  });
  forEachTrafficPlane((p) => {
    p.bumpKey ??= `traffic~${Math.random().toString(36).slice(2)}`;
    add(
      p.bumpKey,
      p.x,
      p.y,
      p.z,
      bumpRadius('plane'),
      p.heading,
      (push, roll) => shove(p, push, roll, false)
    );
  });
  hooks.forEachBalloon?.((b) => {
    b.bumpKey ??= `balloon~${Math.random().toString(36).slice(2)}`;
    add(
      b.bumpKey,
      b.x,
      b.y + 6,
      b.z,
      8.0,
      b.heading,
      (push, roll) => shove(b, push, roll, false)
    );
  });
  // The cars on the roads: knocked sideways out of their lane, easing back
  forEachRoadCar((c) => {
    c.bumpKey ??= `car~${Math.random().toString(36).slice(2)}`;
    add(
      c.bumpKey,
      c.x,
      c.y + BUGGY_CENTER,
      c.z,
      bumpRadius('buggy'),
      c.heading,
      (push) => bumpRoadCar(c, push, BUMP.KEEP)
    ).car = true;
  });
  return out;
}

// This player's plane or buggy bumped: pushed along `push`
function bumpMe(push, roll, buggy) {
  if (buggy) {
    pushBuggy(push.x * BUMP.PUSH, push.z * BUMP.PUSH);
    slowBuggy(BUMP.KEEP);
  } else {
    myPush.x += push.x * BUMP.PUSH;
    myPush.y += push.y * BUMP.PUSH;
    myPush.z += push.z * BUMP.PUSH;
    state.flightSpeedMultiplier *= BUMP.KEEP;
    state.bumpRoll = roll;
  }
  state.impactShake = Math.max(state.impactShake || 0, SHAKE);
  smashHaptic(false);
}

// One of this player's bots or a traffic plane bumped: its push fades in
// bot-logic.js or traffic.js
function shove(thing, push, roll, buggy) {
  thing.push ??= {x: 0, y: 0, z: 0};
  thing.push.x += push.x * BUMP.PUSH;
  thing.push.y += buggy ? 0 : push.y * BUMP.PUSH;
  thing.push.z += push.z * BUMP.PUSH;
  thing.speed *= BUMP.KEEP;
  if (!buggy) thing.bank += roll;
}

function pairKey(a, b) {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

function bump(p, q) {
  // Where they touched, for the puff and the sound
  const x = (p.b.x + q.b.x) / 2;
  const y = (p.b.y + q.b.y) / 2;
  const z = (p.b.z + q.b.z) / 2;
  if (p.hit) {
    _other.x = q.b.x;
    _other.y = q.b.y;
    _other.z = q.b.z;
    pushAway(p.b, _other, p.heading, _push);
    p.hit(_push, bumpRoll(_push, p.heading));
  }
  if (q.hit) {
    _other.x = p.b.x;
    _other.y = p.b.y;
    _other.z = p.b.z;
    pushAway(q.b, _other, q.heading, _push);
    q.hit(_push, bumpRoll(_push, q.heading));
  }
  propPuffs(x, y - 2, z, 4, 4, PUFF, 8, 5, 2);
  const mine = p.key === 'me' || q.key === 'me';
  const d = mine ? 0 : camera.position.distanceTo(_at.set(x, y, z));
  playBump(mine ? 1 : 0.6 * (1 - d / HEAR_RANGE));
}

/** Called once per frame while flying, before the camera follows. */
export function applyBumps(delta) {
  state.bumpRoll = (state.bumpRoll || 0) * Math.exp(-4 * delta);
  if (Math.abs(state.bumpRoll) < 0.002) state.bumpRoll = 0;
  if (myPush.lengthSq() < 1) {
    myPush.set(0, 0, 0);
    return;
  }
  if (activePlaneType !== 'buggy' && !state.isFreeCamera) {
    planeGroup.position.addScaledVector(myPush, delta);
  }
  myPush.x = fadePush(myPush.x, delta);
  myPush.y = fadePush(myPush.y, delta);
  myPush.z = fadePush(myPush.z, delta);
}

/** Called once per frame while flying, after everyone has moved. */
export function updateBumps(delta) {
  clock += delta;
  const list = bodies();
  // Only pairs this screen pushes someone in: one of them is this
  // player's, a bot of theirs, or the traffic
  for (let i = 0; i < list.length; i++) {
    const p = list[i];
    for (let j = i + 1; j < list.length; j++) {
      const q = list[j];
      if (!p.hit && !q.hit) continue;
      // Cars pass through each other where highways cross
      if (p.car && q.car) continue;
      if (!touched(p.a, p.b, p.r, q.a, q.b, q.r)) continue;
      const key = pairKey(p.key, q.key);
      if ((ghosts.get(key) ?? -Infinity) > clock) continue;
      ghosts.set(key, clock + BUMP.GHOST);
      bump(p, q);
    }
  }
  last.clear();
  for (const p of list) last.set(p.key, p.b);
  for (const [key, until] of ghosts) if (until <= clock) ghosts.delete(key);
}
