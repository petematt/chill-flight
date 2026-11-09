// --- AMBIENT HOT AIR BALLOONS: FLIGHT & BIOME LOGIC ---
// Pure math for ambient environmental hot air balloons (balloons.js draws them):
// - Biome validation (favors valleys, plains, canyons; excludes arctic ice & deep sea)
// - Gentle wind-aligned drift and buoyant equilibrium bobbing
// - Terrain clearance and ridge climbing
// - Solo and multi-balloon festival cluster spawning
// - Night glow pulse timings
// Pure JavaScript: no three.js or DOM, so scripts/test-balloons.js can run in Node.

export const SPAWN_DISTANCE_MIN = 2500;
export const SPAWN_DISTANCE_MAX = 5500;
export const DESPAWN_DISTANCE = 7500;

export const GROUND_CLEARANCE = 140;
export const MIN_CLEARANCE = 50;
const LOOK_AHEAD = 3500;
const SCAN_STEP = 250;
const CLIMB_SLOPE = 0.09; // rise per unit drifted (~5 degrees)
const CLIMB_GAIN = 0.3;
const VERTICAL_EASE = 1.8;

export const MIN_DRIFT_SPEED = 12; // units/s (~12 knots)
export const MAX_DRIFT_SPEED = 24; // units/s (~24 knots)

export const EMBLEMS = ['sunburst', 'cloud', 'mountain'];

const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

// Heading as the game uses it: 0 flies north (-z), PI / 2 flies west (-x)
export function forwardOf(heading) {
  return {x: -Math.sin(heading), z: -Math.cos(heading)};
}

export function headingOfVector(vx, vz) {
  return Math.atan2(-vx, -vz);
}

/**
 * Validates if a world location is appropriate for hot air balloons.
 * Rejects frozen arctic pack ice (z < -16000) and deep open ocean far offshore.
 */
export function isSuitableBalloonBiome(x, z, groundElevation) {
  // 1. Exclude frozen north pack ice shelf and extreme tundra
  if (z < -16000) return false;

  // 2. Exclude deep open sea (water level is 40; sea floor is ~10-30 down)
  // Island coasts and continental land have elevation >= 42
  const isLandOrShallows = groundElevation >= 42;
  const isNearContinentalCore = Math.abs(x) < 14000 && z > -15000 && z < 15000;
  if (!isLandOrShallows && !isNearContinentalCore) return false;

  return true;
}

// Scans ahead along heading to find necessary altitude to smoothly clear upcoming terrain
function heightAlong(p, heading, elevationAt, range = LOOK_AHEAD) {
  const {x: fx, z: fz} = forwardOf(heading);
  let needed = p.cruiseAlt;
  for (let d = 0; d <= range; d += SCAN_STEP) {
    const cx = p.x + fx * d;
    const cz = p.z + fz * d;
    const ground = elevationAt(cx, cz);
    const h = ground + GROUND_CLEARANCE - d * CLIMB_SLOPE;
    if (h > needed) needed = h;
  }
  return needed;
}

/**
 * Creates an ambient balloon object.
 */
export function createBalloonData({
  x,
  z,
  heading,
  speed,
  cruiseAlt,
  livery,
  emblem,
  rng = Math.random,
  clusterId = null,
}) {
  return {
    x,
    y: cruiseAlt,
    z,
    heading,
    pitch: 0,
    bank: 0,
    speed,
    cruiseSpeed: speed,
    cruiseAlt,
    heldAlt: cruiseAlt,
    verticalSpeed: 0,
    type: 'balloon',
    livery,
    emblem,
    clusterId,
    // Buoyant breathing bob
    bobPhase: rng() * Math.PI * 2,
    bobFreq: lerp(0.04, 0.08, rng()),
    bobAmp: lerp(1.5, 3.5, rng()),
    // Subtle pendular sway
    swayPhase: rng() * Math.PI * 2,
    swayFreq: lerp(0.08, 0.15, rng()),
    swayAmp: lerp(0.02, 0.05, rng()),
    // Night glow timer
    glowTimer: lerp(1, 5, rng()),
    glowDuration: 0,
    isGlowing: false,
    age: 0,
  };
}

/**
 * Spawns a single ambient balloon drifting around the center position.
 */
export function spawnAmbientBalloon(
  rng,
  centerX,
  centerZ,
  elevationAt,
  liveryCount,
  windVector = {x: 0, z: -1}
) {
  let angle = rng() * Math.PI * 2;
  let dist = lerp(SPAWN_DISTANCE_MIN, SPAWN_DISTANCE_MAX, rng());
  let x = centerX + Math.cos(angle) * dist;
  let z = centerZ + Math.sin(angle) * dist;

  // Verify biome suitability; if unsuitable, try a couple of alternative samples
  for (let attempt = 0; attempt < 4; attempt++) {
    if (isSuitableBalloonBiome(x, z, elevationAt(x, z))) break;
    angle = rng() * Math.PI * 2;
    dist = lerp(SPAWN_DISTANCE_MIN, SPAWN_DISTANCE_MAX, rng());
    x = centerX + Math.cos(angle) * dist;
    z = centerZ + Math.sin(angle) * dist;
  }

  // Drift aligns with prevailing wind vector with gentle angular variation (±20°)
  const baseHeading = headingOfVector(windVector.x, windVector.z);
  const heading = baseHeading + (rng() - 0.5) * 0.7;
  const speed = lerp(MIN_DRIFT_SPEED, MAX_DRIFT_SPEED, rng());

  const ground = elevationAt(x, z);
  const cruiseAlt = Math.max(
    ground + GROUND_CLEARANCE,
    lerp(ground + GROUND_CLEARANCE, ground + GROUND_CLEARANCE + 280, rng())
  );

  const livery = Math.floor(rng() * liveryCount);
  const emblem = EMBLEMS[Math.floor(rng() * EMBLEMS.length)];

  const b = createBalloonData({
    x,
    z,
    heading,
    speed,
    cruiseAlt,
    livery,
    emblem,
    rng,
  });
  b.y = heightAlong(b, heading, elevationAt, LOOK_AHEAD);
  return b;
}

/**
 * Spawns a festival cluster of balloons (e.g. 3 balloons) floating across a valley together.
 */
export function spawnBalloonCluster(
  rng,
  centerX,
  centerZ,
  elevationAt,
  liveryCount,
  windVector = {x: 0, z: -1},
  count = 3
) {
  const leader = spawnAmbientBalloon(
    rng,
    centerX,
    centerZ,
    elevationAt,
    liveryCount,
    windVector
  );
  leader.clusterId = `cluster-${Math.floor(rng() * 100000)}`;

  const cluster = [leader];
  for (let i = 1; i < count; i++) {
    // Offset sideways and altitude
    const offsetX = (rng() - 0.5) * 500;
    const offsetZ = (rng() - 0.5) * 500;
    const altOffset = (rng() - 0.5) * 160;

    const x = leader.x + offsetX;
    const z = leader.z + offsetZ;
    const cruiseAlt = Math.max(
      elevationAt(x, z) + GROUND_CLEARANCE,
      leader.cruiseAlt + altOffset
    );

    const livery = Math.floor(rng() * liveryCount);
    const emblem = EMBLEMS[Math.floor(rng() * EMBLEMS.length)];
    const speed = leader.speed * lerp(0.92, 1.08, rng());
    const heading = leader.heading + (rng() - 0.5) * 0.15;

    const companion = createBalloonData({
      x,
      z,
      heading,
      speed,
      cruiseAlt,
      livery,
      emblem,
      rng,
      clusterId: leader.clusterId,
    });
    companion.y = heightAlong(companion, heading, elevationAt, LOOK_AHEAD);
    cluster.push(companion);
  }
  return cluster;
}

/**
 * Steps an ambient balloon forward in time by dt seconds.
 */
export function stepAmbientBalloon(
  b,
  dt,
  elevationAt,
  isNightOrDusk = false
) {
  b.age += dt;

  // Gentle forward drift along heading
  const fwd = forwardOf(b.heading);
  b.x += fwd.x * b.speed * dt;
  b.z += fwd.z * b.speed * dt;

  // Periodic terrain clearance check
  const needed = heightAlong(b, b.heading, elevationAt, LOOK_AHEAD);
  if (needed > b.heldAlt) {
    b.heldAlt = needed;
  } else if (b.heldAlt - needed > 60) {
    b.heldAlt -= 10 * dt;
  }

  // Vertical easing toward target clearance
  const desiredClimb = clamp((b.heldAlt - b.y) * CLIMB_GAIN, -12, 25);
  const k = 1 - Math.exp(-dt * VERTICAL_EASE);
  b.verticalSpeed =
    (b.verticalSpeed ?? 0) + (desiredClimb - (b.verticalSpeed ?? 0)) * k;

  // Buoyant bobbing sinusoidal oscillation
  const bobOffset = Math.sin(b.bobPhase + b.age * b.bobFreq * Math.PI * 2) * b.bobAmp;
  const ground = elevationAt(b.x, b.z);

  b.y = Math.max(
    ground + MIN_CLEARANCE,
    b.y + b.verticalSpeed * dt + bobOffset * 0.15 * dt
  );

  // Subtle pendular sway (roll and pitch sway gently in air thermals)
  b.bank = Math.sin(b.swayPhase + b.age * b.swayFreq * Math.PI * 2) * b.swayAmp;
  b.pitch = Math.cos(b.swayPhase + b.age * b.swayFreq * 0.8 * Math.PI * 2) * (b.swayAmp * 0.6);

  // Night glow pulses: at night or dusk, burners occasionally puff on for 1.5 - 3 seconds
  if (isNightOrDusk) {
    b.glowTimer -= dt;
    if (b.isGlowing) {
      b.glowDuration -= dt;
      if (b.glowDuration <= 0) {
        b.isGlowing = false;
        b.glowTimer = 4 + Math.random() * 8; // wait between burns
      }
    } else if (b.glowTimer <= 0) {
      b.isGlowing = true;
      b.glowDuration = 1.6 + Math.random() * 1.6; // burn length
    }
  } else {
    b.isGlowing = false;
  }

  return b;
}

export function isAmbientBalloonGone(b, centerX, centerZ) {
  const dx = b.x - centerX;
  const dz = b.z - centerZ;
  return dx * dx + dz * dz > DESPAWN_DISTANCE * DESPAWN_DISTANCE;
}
