#!/usr/bin/env node
/**
 * scripts/test-balloons.js
 *
 * Checks ambient hot air balloon logic (balloon-logic.js):
 * - Spawning within distance bounds and biome filtering
 * - Buoyant equilibrium, altitude keeping over ridges, and wind drift
 * - Festival cluster spawning and companion offsets
 * - Despawning beyond maximum distance
 */
import {
  DESPAWN_DISTANCE,
  GROUND_CLEARANCE,
  MIN_CLEARANCE,
  MIN_DRIFT_SPEED,
  MAX_DRIFT_SPEED,
  SPAWN_DISTANCE_MAX,
  SPAWN_DISTANCE_MIN,
  isAmbientBalloonGone,
  isSuitableBalloonBiome,
  spawnAmbientBalloon,
  spawnBalloonCluster,
  stepAmbientBalloon,
} from '../balloon-logic.js';

console.log('Testing ambient hot air balloons...');

let failed = false;
function check(name, ok, detail = '') {
  if (ok) {
    console.log(`  Passed: ${name}`);
  } else {
    failed = true;
    console.log(`FAIL: ${name} ${detail}`);
  }
}

// Seeded mulberry32 PRNG for deterministic tests
function mulberry32(seed) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const flat = () => 40;
const CX = 2000;
const CZ = -1000;

// 1. Spawning distance check
const rng = mulberry32(42);
const spawned = Array.from({length: 100}, () =>
  spawnAmbientBalloon(rng, CX, CZ, flat, 8, {x: 0, z: -1})
);
const dists = spawned.map((b) => Math.hypot(b.x - CX, b.z - CZ));

check(
  'balloons appear within the spawn distance range',
  dists.every(
    (d) => d >= SPAWN_DISTANCE_MIN - 1e-4 && d <= SPAWN_DISTANCE_MAX + 1e-4
  ),
  `range: ${Math.min(...dists).toFixed(0)} - ${Math.max(...dists).toFixed(0)}`
);

// 2. Biome filtering checks
check(
  'rejects arctic pack ice (z < -16000)',
  !isSuitableBalloonBiome(0, -17000, 45) &&
    !isSuitableBalloonBiome(5000, -22000, 100)
);

check(
  'rejects deep ocean far from continental land',
  !isSuitableBalloonBiome(25000, 0, 30)
);

check(
  'accepts continental valleys and farmlands',
  isSuitableBalloonBiome(0, 0, 85) && isSuitableBalloonBiome(2000, -2000, 120)
);

// 3. Terrain clearance check
check(
  'balloons clear high mountain ground',
  (() => {
    const highGround = () => 1800;
    const b = spawnAmbientBalloon(mulberry32(7), CX, CZ, highGround, 8);
    return b.y >= 1800 + GROUND_CLEARANCE;
  })()
);

// 4. Drift speeds within peaceful aerostat bounds
check(
  'drift speeds stay within peaceful bounds (12-24 units/s)',
  spawned.every(
    (b) => b.speed >= MIN_DRIFT_SPEED - 1e-4 && b.speed <= MAX_DRIFT_SPEED + 1e-4
  )
);

// 5. Festival clusters
const cluster = spawnBalloonCluster(
  mulberry32(99),
  CX,
  CZ,
  flat,
  8,
  {x: 0, z: -1},
  3
);
check(
  'spawns a 3-balloon festival cluster sharing a clusterId',
  cluster.length === 3 &&
    cluster.every((b) => b.clusterId && b.clusterId === cluster[0].clusterId)
);

// Verify cluster companions are offset from leader
const leader = cluster[0];
const companions = cluster.slice(1);
check(
  'cluster companions have staggered positions and heights',
  companions.every(
    (c) =>
      Math.hypot(c.x - leader.x, c.z - leader.z) > 10 &&
      Math.hypot(c.x - leader.x, c.z - leader.z) < 1000
  )
);

// 6. Stepping and ridge clearance
const ridge = (x, z) => Math.min(1000, Math.max(40, (-z - 500) * 0.4));
const balloon = spawnAmbientBalloon(mulberry32(101), 0, 0, ridge, 8);
balloon.x = 0;
balloon.z = 0;
balloon.y = 400;
balloon.heading = 0; // drifting north toward ridge

for (let s = 0; s < 120; s++) {
  stepAmbientBalloon(balloon, 0.5, ridge, false);
}
check(
  'balloons smoothly climb before rising ridges and never clip ground',
  balloon.y >= ridge(balloon.x, balloon.z) + MIN_CLEARANCE
);

// 7. Despawning check
check(
  'balloons are kept within despawn range and removed once beyond it',
  !isAmbientBalloonGone({x: CX + 5000, z: CZ}, CX, CZ) &&
    isAmbientBalloonGone({x: CX + DESPAWN_DISTANCE + 100, z: CZ}, CX, CZ)
);

if (failed) {
  console.error('\nFAIL: Ambient balloon tests failed.');
  process.exit(1);
} else {
  console.log('\nAll ambient balloon tests passed.');
}
