// --- OTHER PLANES' MODELS ---
// The game's plane models as other planes wear them, in any livery: the
// traffic flying around (traffic.js) and the planes parked at the airports
// (airports.js).
import * as THREE from 'three';
import {ChillFlightLogic} from './chill-flight-logic.js';
import {createMaterial} from './constants.js';
import {createBiplaneModel} from './biplane.js';
import {createTwinModel} from './twin.js';
import {createJetModel} from './jet.js';
import {createSeaplaneModel} from './airplane.js';
import {createBuggyModel} from './buggy-model.js';
import {createBalloonModel} from './balloon-model.js';
import {softenAnimeLight} from './art-style.js';

// The seaplane flies without the player's pontoons, so it has no landing
// gear; the buggy is for friends driving one (multiplayer.js)
export const PLANE_BUILDERS = {
  seaplane: (opts) => createSeaplaneModel({...opts, pontoons: false}),
  biplane: createBiplaneModel,
  twin: createTwinModel,
  jet: createJetModel,
  buggy: createBuggyModel,
  balloon: createBalloonModel,
};

// One pair of materials per livery, shared by every plane wearing it (the
// light trim is dark on sand, as on the player's plane)
const liveryMats = new Map();
function materialsFor(livery) {
  if (!liveryMats.has(livery)) {
    const color = ChillFlightLogic.PLANE_COLORS[livery];
    liveryMats.set(livery, {
      planeMat: createMaterial({color, flatShading: true}),
      planeWhiteMat: createMaterial({
        color: color === 0xe8c382 ? 0x1c3144 : 0xffffff,
        flatShading: true,
      }),
    });
  }
  return liveryMats.get(livery);
}

// A plane of the given type (a PLANE_BUILDERS key) in livery number `livery`
// (ChillFlightLogic.PLANE_COLORS), casting shadows
export function buildPlaneModel(type, livery) {
  const model = PLANE_BUILDERS[type]({
    planeColor: ChillFlightLogic.PLANE_COLORS[livery],
    ...materialsFor(livery),
  });
  model.traverse((child) => {
    if (child.isMesh) {
      child.castShadow = true;
      child.receiveShadow = false;
    }
  });
  softenAnimeLight(model);
  return model;
}

// Whether a material is one of the shared livery materials (not to be
// disposed with a plane)
export function isLiveryMaterial(material) {
  for (const m of liveryMats.values()) {
    if (m.planeMat === material || m.planeWhiteMat === material) return true;
  }
  return false;
}

const _tipBox = new THREE.Box3();
const _v = new THREE.Vector3();

// The middle of each wingtip's outer end, [left, right], in the model's
// parent's space: the vertices within a unit of the plane's widest point,
// averaged. Traffic hangs its navigation lights there.
export function wingtipPoints(model) {
  model.updateMatrixWorld(true);
  _tipBox.setFromObject(model);
  const tips = [
    {x: _tipBox.min.x, sum: new THREE.Vector3(), n: 0},
    {x: _tipBox.max.x, sum: new THREE.Vector3(), n: 0},
  ];
  model.traverse((child) => {
    const pos = child.isMesh && child.geometry.attributes.position;
    if (!pos) return;
    for (let i = 0; i < pos.count; i++) {
      _v.fromBufferAttribute(pos, i).applyMatrix4(child.matrixWorld);
      for (const tip of tips) {
        if (Math.abs(_v.x - tip.x) < 1) {
          tip.sum.add(_v);
          tip.n++;
        }
      }
    }
  });
  return tips.map((tip) => tip.sum.divideScalar(tip.n).setX(tip.x));
}
