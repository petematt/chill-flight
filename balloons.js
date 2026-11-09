// --- AMBIENT HOT AIR BALLOONS (SCENE MANAGEMENT) ---
// Spawns and manages atmospheric hot air balloons in the environment (solo drifters
// and valley festival clusters). They drift peacefully across scenic biomes,
// bob in buoyant equilibrium, pulse warm night-glows at dusk, and feature
// distance-based LOD culling and proximity audio.
import * as THREE from 'three';
import {scene} from './scene.js';
import {camera} from './sky.js';
import {planeGroup} from './airplane.js';
import {state} from './state.js';
import {ChillFlightLogic} from './chill-flight-logic.js';
import {createBalloonModel} from './balloon-model.js';
import {isLiveryMaterial} from './plane-models.js';
import {getElevation} from './terrain-geometry.js';
import {trafficEnabled} from './traffic.js';
import {fadePush} from './bumps-logic.js';
import {hooks} from './hooks.js';
import {
  isAmbientBalloonGone,
  spawnAmbientBalloon,
  spawnBalloonCluster,
  stepAmbientBalloon,
} from './balloon-logic.js';
import {playBurnerSound} from './sfx.js';

hooks.forEachBalloon = forEachBalloon;

const MAX_BALLOONS = 5;
const SPAWN_INTERVAL_MIN = 25;
const SPAWN_INTERVAL_MAX = 55;
const FIRST_SPAWN_DELAY = 4;
const PROXIMITY_AUDIO_DIST = 320;

const balloons = [];
let spawnTimer = FIRST_SPAWN_DELAY;
let lastAudioTime = 0;

function buildBalloon(b) {
  const group = new THREE.Group();
  group.rotation.order = 'YXZ';

  const color =
    ChillFlightLogic.PLANE_COLORS[b.livery] ?? ChillFlightLogic.PLANE_COLORS[0];
  const model = createBalloonModel({
    planeColor: color,
    emblem: b.emblem,
    nightGlow: true,
  });
  group.add(model);
  group.userData.model = model;

  scene.add(group);
  return group;
}

function disposeBalloon(group) {
  scene.remove(group);
  group.traverse((child) => {
    if (child.geometry) child.geometry.dispose();
    if (child.material && !isLiveryMaterial(child.material)) {
      if (Array.isArray(child.material)) {
        child.material.forEach((m) => {
          if (!isLiveryMaterial(m)) m.dispose();
        });
      } else {
        child.material.dispose();
      }
    }
  });
}

function removeAll() {
  for (const b of balloons) disposeBalloon(b.group);
  balloons.length = 0;
}

export function balloonsCount() {
  return balloons.length;
}

export function forEachBalloon(fn) {
  for (const b of balloons) fn(b);
}

const _camPos = new THREE.Vector3();
const _balloonPos = new THREE.Vector3();

export function updateBalloons(delta) {
  if (!trafficEnabled()) {
    if (balloons.length > 0) removeAll();
    return;
  }

  const center = state.isFreeCamera ? camera.position : planeGroup.position;
  _camPos.copy(camera.position);

  // Weather check: hot air balloons only spawn in fair weather (no rain or heavy storms)
  const fairWeather = (state.precipitation ?? 0) < 0.25;

  spawnTimer -= delta;
  if (spawnTimer <= 0 && balloons.length < MAX_BALLOONS && fairWeather) {
    // 35% chance to spawn a festival cluster of 3 balloons, otherwise a solo drifter
    const shouldSpawnCluster = Math.random() < 0.35 && balloons.length <= MAX_BALLOONS - 3;
    if (shouldSpawnCluster) {
      const cluster = spawnBalloonCluster(
        Math.random,
        center.x,
        center.z,
        getElevation,
        ChillFlightLogic.PLANE_COLORS.length,
        {x: 0.2, z: -0.9},
        3
      );
      for (const b of cluster) {
        b.group = buildBalloon(b);
        balloons.push(b);
      }
    } else {
      const b = spawnAmbientBalloon(
        Math.random,
        center.x,
        center.z,
        getElevation,
        ChillFlightLogic.PLANE_COLORS.length,
        {x: 0.2, z: -0.9}
      );
      b.group = buildBalloon(b);
      balloons.push(b);
    }

    spawnTimer =
      SPAWN_INTERVAL_MIN +
      Math.random() * (SPAWN_INTERVAL_MAX - SPAWN_INTERVAL_MIN);
  }

  // Dusk / night factor for night glows
  const isNightOrDusk = state.dayFactor !== undefined ? state.dayFactor < 0.45 : false;
  const now = performance.now() / 1000;

  for (let i = balloons.length - 1; i >= 0; i--) {
    const b = balloons[i];
    stepAmbientBalloon(b, delta, getElevation, isNightOrDusk);

    // Apply collision bump shove from bumps.js
    if (b.push) {
      b.x += b.push.x * delta;
      b.y += b.push.y * delta;
      b.z += b.push.z * delta;
      for (const k of ['x', 'y', 'z']) b.push[k] = fadePush(b.push[k], delta);
      if (Math.hypot(b.push.x, b.push.y, b.push.z) < 1) b.push = null;
    }

    // Despawn once out of range
    if (isAmbientBalloonGone(b, center.x, center.z)) {
      disposeBalloon(b.group);
      balloons.splice(i, 1);
      continue;
    }

    const g = b.group;
    g.position.set(b.x, b.y, b.z);
    g.rotation.set(b.pitch, b.heading, b.bank);

    // Update burner flame & point light for night glow
    if (g.userData.model?.userData?.setBurnerActive) {
      g.userData.model.userData.setBurnerActive(b.isGlowing, 1.0);
    }

    // Distance-based LOD culling (hides sub-pixel cables & decals at distance)
    _balloonPos.set(b.x, b.y, b.z);
    const distSq = _camPos.distanceToSquared(_balloonPos);
    if (g.userData.model?.userData?.updateLOD) {
      g.userData.model.userData.updateLOD(distSq);
    }

    // Proximity burner audio: triggers subtle muffled whoosh when player flies near
    if (!state.isFreeCamera && distSq < PROXIMITY_AUDIO_DIST * PROXIMITY_AUDIO_DIST) {
      if (now - lastAudioTime > 5.0 && Math.random() < 0.25 * delta) {
        lastAudioTime = now;
        playBurnerSound?.();
      }
    }
  }
}
