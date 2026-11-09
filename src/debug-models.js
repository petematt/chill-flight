// Entry point for debug/debug-models.html: only what the model viewer needs, so it
// doesn't start the game's renderer or terrain workers.
import '../storage-polyfill.js';
import './sentry.js';
import '../logger.js';
import '../chill-flight-logic.js';
import '../state.js';
import '../constants.js';
import '../biplane.js';
import '../twin.js';
import '../buggy-model.js';
import '../airplane.js';
import '../tree-models.js';
import '../terrain-geometry.js';

import * as THREE from 'three';
import {OrbitControls} from 'three/examples/jsm/controls/OrbitControls.js';
import {ChillFlightLogic} from '../chill-flight-logic.js';
import {destructibleTypes, startDestruction} from '../debug/destruction.js';
import {createMaterial} from '../constants.js';
import {createBiplaneModel} from '../biplane.js';
import {createJetModel} from '../jet.js';
import {
  createAirportSign,
  createControlTower,
  createHangar,
  createWindsock,
} from '../airports.js';
import {createWaterfall} from '../waterfalls.js';
import {
  ROAD_VEHICLES,
  ROAD_VEHICLE_SCALE,
  buildRoadVehicle,
} from '../road-vehicles.js';
import {basaltGate, canyonBridge, seaArch} from '../arches-logic.js';
import {archGeometry} from '../arches.js';
import {boatMat, buildSmallBoatGeos} from '../boat-models.js';
import {buildTractorGeos} from '../farm-models.js';
import {buildSwampGeos} from '../swamp-models.js';
import {
  buildLandmarkGeos,
  buildingMat,
  DINO_SKULL_COLORWAYS,
  DINO_SKULL_SPECIES,
  dinoSkullGeo,
  DRAGON_COLORWAYS,
  dragonSkeletonGeo,
  LANDMARK_HOUSES,
  LANDMARK_SMALL,
  buildTentGeos,
} from '../building-models.js';
import {createTwinModel, setGearExtension} from '../twin.js';
import {createBuggyModel, setBuggyHoverFold} from '../buggy-model.js';
import {createBalloonModel} from '../balloon-model.js';
import {
  createSeaplaneModel,
  planeMat,
  planeWhiteMat,
  poseGear,
} from '../airplane.js';
import {
  ModelAssembler,
  animationUniforms,
  barnMat,
  hayBarnBodyGeo,
  hayBarnRoofGeo,
  timberBarnBodyGeo,
  timberBarnRoofGeo,
  bridgeDeckGeo,
  bridgeDeckMat,
  bridgeGirderGeo,
  bridgeGirderMat,
  bridgePierCapGeo,
  bridgePierFootingGeo,
  bridgePierShaftGeo,
  bridgePilingMat,
  bridgeRailGeo,
  bushGeo,
  cactusGeo,
  cactusMat,
  joshuaGeos,
  joshuaTrunkMat,
  hayBaleGeo,
  hayBaleMat,
  fallenLogGeo,
  stumpGeo,
  fallenLogMat,
  sealGeo,
  sealMat,
  createDolphinModel,
  buoyGeos,
  buoyTopMat,
  mastGeometry,
  sheepGeos,
  goatGeos,
  deerGeos,
  sheepDarkMat,
  iceHutGeos,
  iceHutRoofMat,
  appleTreeGeos,
  birchGeos,
  broadleafOakGeos,
  castleRuinsGeo,
  castleRuinsMat,
  cherryBlossomGeos,
  createRockArchGeometries,
  deadCottonwoodGeo,
  deadTreeGeo,
  deadTreeMat,
  deciduousGeos,
  fruitTreeGeos,
  japaneseMapleGeos,
  lilyPadGeo,
  lilyPadMat,
  magnoliaGeos,
  mountainRowanGeos,
  mushroomGeos,
  mushroomStalkMat,
  crystalClusterGeo,
  crystalMat,
  oakGeos,
  orchardAppleGeos,
  palmGeos,
  pierDeckGeo,
  pierDeckLGeo,
  pierDeckMat,
  plumTreeGeos,
  rockGeo,
  rockMat,
  sculptedPineGeos,
  snowSpruceGeos,
  snowmanBodyMat,
  snowmanGeos,
  snowmanNoseMat,
  tallDeciduousGeos,
  tentGeos,
  tentMat,
  treeLeavesGeo,
  treeTrunkGeo,
  treeTrunkMat,
  twistedDeadOakGeo,
  waterUniforms,
  woodMat,
} from '../terrain-geometry.js';
import {
  JOSHUA_LEAF_COLOR,
  ICE_HUT_COLORS,
  SHEEP_WOOL_COLORS,
  GOAT_COLORS,
  DEER_COLORS,
} from '../terrain-gen.js';

// Setup Viewer
const container = document.getElementById('viewer');
const viewScene = new THREE.Scene();
window.viewScene = viewScene;
viewScene.background = new THREE.Color(0x0f172a);

const camera = new THREE.PerspectiveCamera(
  45,
  container.clientWidth / container.clientHeight,
  0.1,
  1000
);
camera.position.set(20, 20, 20);

let renderer = null;
try {
  renderer = new THREE.WebGLRenderer({antialias: true});
} catch {
  try {
    renderer = new THREE.WebGLRenderer({antialias: false});
  } catch {
    // Failed
  }
}

if (!renderer) {
  container.innerHTML =
    '<div style="display:flex;align-items:center;justify-content:center;height:100%;color:#fff;font-family:sans-serif;text-align:center;padding:20px;">WebGL 2 is not supported or context creation failed.</div>';
} else {
  renderer.setSize(container.clientWidth, container.clientHeight);
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  container.appendChild(renderer.domElement);
}

const controls = renderer
  ? new OrbitControls(camera, renderer.domElement)
  : null;
if (controls) controls.enableDamping = true;

// Lights - Synchronized with game settings for consistent colors
const hemiLight = new THREE.HemisphereLight(0xffffff, 0x444444, 0.6);
viewScene.add(hemiLight);

const dirLight = new THREE.DirectionalLight(0xfff0dd, 0.8);
dirLight.position.set(50, 100, 50);
dirLight.castShadow = true;
viewScene.add(dirLight);

// Grid
const grid = new THREE.GridHelper(100, 20, 0x475569, 0x1e293b);
viewScene.add(grid);

window.currentModel = null;
window.currentColorSeed = 0;
window.currentModelType = null;
let isDestroyed = false;
let activeDestruction = null;

function clearViewer() {
  activeDestruction = null;
  if (window.currentModel) {
    viewScene.remove(window.currentModel);
    window.currentModel = null;
  }
}

// Twin only: preview the landing gear folded away (kept across color cycles)
window.gearUp = false;
function toggleGear() {
  window.gearUp = !window.gearUp;
  if (window.currentModelType) {
    viewModel(window.currentModelType, null, window.currentColorSeed);
  }
}

function cycleColors() {
  window.currentColorSeed++;
  if (window.currentModelType) {
    viewModel(window.currentModelType, null, window.currentColorSeed);
  }
}

function toggleDestruction() {
  const btn = document.getElementById('destroy-toggle');
  if (isDestroyed) {
    isDestroyed = false;
    activeDestruction = null;
    if (btn) btn.textContent = 'Destroy';
    viewModel(window.currentModelType, null, window.currentColorSeed);
  } else {
    isDestroyed = true;
    if (btn) btn.textContent = 'Reset';
    activeDestruction = startDestruction(
      window.currentModelType,
      window.currentModel,
      {rockMat, woodMat}
    );
  }
}

// Expose globally early so HTML onclick attributes and buttons immediately work
window.viewModel = viewModel;
window.cycleColors = cycleColors;
window.toggleGear = toggleGear;
window.toggleDestruction = toggleDestruction;

function viewModel(type, e, colorSeed = 0) {
  const keepCamera = !e && window.currentModelType === type;
  clearViewer();

  if (e || (colorSeed === 0 && !keepCamera)) {
    window.currentColorSeed = 0;
  }
  window.currentModelType = type;
  isDestroyed = false;
  activeDestruction = null;

  const supportsColors = [
    'house',
    'two_story_house',
    'tent',
    'sailboat',
    'pirateship',
    'airplane',
    'biplane',
    'twin',
    'twin-engine',
    'jet',
    'buggy',
    'balloon',
    'mushroom',
    'crystal',
    'road_vehicles',
    'dragon_skeleton',
    'dinosaur_skull',
    'birch',
    'broadleaf_oak',
    'oak',
  ].includes(type);

  const colorBtn = document.getElementById('cycle-colors-btn');
  if (colorBtn) colorBtn.style.display = supportsColors ? 'block' : 'none';

  const gearToggle = document.getElementById('gear-toggle');
  const supportsGear = [
    'airplane',
    'jet',
    'twin',
    'twin-engine',
    'twin_engine',
    'buggy',
    'balloon',
  ].includes(type);
  gearToggle.style.display = supportsGear ? 'block' : 'none';
  if (type === 'airplane') {
    gearToggle.textContent = window.gearUp ? 'Floats down' : 'Floats up';
  } else if (type === 'buggy') {
    gearToggle.textContent = window.gearUp ? 'Wheels down' : 'Hover mode';
  } else if (type === 'balloon') {
    gearToggle.textContent = window.gearUp ? 'Burner off' : 'Burner glow';
  } else {
    gearToggle.textContent = window.gearUp ? 'Gear down' : 'Gear up';
  }

  const destroyToggle = document.getElementById('destroy-toggle');
  const supportsDestruction = destructibleTypes.has(type);
  if (destroyToggle) {
    destroyToggle.style.display = supportsDestruction ? 'block' : 'none';
    destroyToggle.textContent = 'Destroy';
  }

  const visibleButtons = [colorBtn, gearToggle, destroyToggle].filter(
    (btn) => btn && btn.style.display !== 'none'
  );
  visibleButtons.forEach((btn, idx) => {
    btn.style.marginTop = idx === 0 ? '0' : '8px';
  });

  document.getElementById('color-options').style.display =
    visibleButtons.length > 0 ? 'block' : 'none';

  // Update UI
  document.querySelectorAll('.model-btn').forEach((btn) => {
    btn.classList.remove('active');
    // If this was triggered via hash, we need to find the right button
    const clickAttr = btn.getAttribute('onclick') || '';
    if (
      clickAttr.includes(`'${type}'`) ||
      (type === 'twin-engine' && clickAttr.includes("'twin'"))
    ) {
      btn.classList.add('active');
      document.getElementById('model-name').innerText = btn.innerText;
    }
  });

  // Update URL hash
  if (window.location.hash !== `#${type}`) {
    try {
      history.pushState(null, null, `#${type}`);
    } catch {
      // Ignore in restricted iframe contexts
    }
  }

  const previewGroup = new THREE.Group();

  // 1. Try assembling via shared ModelAssembler first
  const structure = ModelAssembler
    ? ModelAssembler.getStructure(type, 0, {
        bodyId: colorSeed,
        roofId: colorSeed,
      })
    : null;

  if (structure) {
    structure.forEach((part) => {
      const mesh = new THREE.Mesh(part.geo, part.mat);
      mesh.position.set(...part.pos);
      mesh.rotation.set(...part.rot);
      if (part.order) mesh.rotation.order = part.order;
      if (part.scale) mesh.scale.set(...part.scale);
      previewGroup.add(mesh);
    });
  } else {
    // 2. Fallback for simple or unique models
    switch (type) {
      case 'airplane': {
        // Always the seaplane: state.airplaneModel is whichever plane
        // the game last built (the saved choice)
        const ap = createSeaplaneModel();

        if (ChillFlightLogic && ChillFlightLogic.PLANE_COLORS) {
          const colors = ChillFlightLogic.PLANE_COLORS;
          const newColor = colors[colorSeed % colors.length];
          const newAccentMat = planeMat.clone();
          newAccentMat.color.setHex(newColor);
          const newBodyMat = planeWhiteMat.clone();
          newBodyMat.color.setHex(newColor === 0xe8c382 ? 0x1c3144 : 0xffffff);

          ap.traverse((child) => {
            if (child.isMesh && child.material) {
              if (child.material === planeMat) {
                child.material = newAccentMat;
              } else if (child.material === planeWhiteMat) {
                child.material = newBodyMat;
              }
            }
          });
        }

        poseGear(window.gearUp ? 0 : 1);
        ap.visible = true;
        previewGroup.add(ap);
        break;
      }

      case 'control_tower':
        previewGroup.add(createControlTower());
        break;
      case 'hangar':
        previewGroup.add(createHangar());
        break;
      case 'windsock':
        previewGroup.add(createWindsock());
        break;
      case 'airport_sign':
        previewGroup.add(createAirportSign('Mesa Field', 1));
        break;
      case 'waterfall': {
        // A sample: a stream across a flat top from a pond, then a
        // fall down a steep slope into water (at y = 40, the game's
        // water level), lowered to the preview's ground. The ground
        // patch stands in for the terrain worker's height grid.
        const groundHeight = (z) =>
          z <= -30 ? 110 : Math.max(30, 110 - (z + 30) * 2.2);
        const cols = 17;
        const rows = 21;
        const heights = new Float32Array(cols * rows);
        for (let r = 0; r < rows; r++) {
          heights.fill(groundHeight(-160 + r * 10), r * cols, (r + 1) * cols);
        }
        const fall = createWaterfall({
          course: [
            [0, 110, -30],
            [0, 85, -19],
            [0, 60, -8],
            [0, 42, 0],
            [0, 37, 6],
          ],
          stream: [
            [0, 110, -110],
            [0, 110, -70],
            [0, 110, -30],
          ],
          ground: {x: -80, z: -160, step: 10, cols, rows, heights},
        });
        fall.position.y = -40;
        previewGroup.add(fall);
        break;
      }

      case 'biplane': {
        const colors =
          ChillFlightLogic && ChillFlightLogic.PLANE_COLORS
            ? ChillFlightLogic.PLANE_COLORS
            : [0x4794db];
        const newColor = colors[colorSeed % colors.length];
        const bp = createBiplaneModel({planeColor: newColor});

        bp.visible = true;
        previewGroup.add(bp);
        break;
      }

      case 'jet': {
        const colors =
          ChillFlightLogic && ChillFlightLogic.PLANE_COLORS
            ? ChillFlightLogic.PLANE_COLORS
            : [0x4794db];
        const newColor = colors[colorSeed % colors.length];
        const jet = createJetModel({planeColor: newColor});
        setGearExtension(jet, window.gearUp ? 0 : 1);

        jet.visible = true;
        previewGroup.add(jet);
        break;
      }

      case 'twin':
      case 'twin-engine':
      case 'twin_engine': {
        const colors =
          ChillFlightLogic && ChillFlightLogic.PLANE_COLORS
            ? ChillFlightLogic.PLANE_COLORS
            : [0xe0564c];
        const newColor = colors[colorSeed % colors.length];
        const tw = createTwinModel({planeColor: newColor});
        setGearExtension(tw, window.gearUp ? 0 : 1);

        tw.visible = true;
        previewGroup.add(tw);
        break;
      }

      case 'buggy': {
        const colors =
          ChillFlightLogic && ChillFlightLogic.PLANE_COLORS
            ? ChillFlightLogic.PLANE_COLORS
            : [0xe0564c];
        const newColor = colors[colorSeed % colors.length];
        const buggy = createBuggyModel({planeColor: newColor});
        setBuggyHoverFold(buggy, window.gearUp ? 1 : 0);
        previewGroup.add(buggy);
        break;
      }

      case 'balloon': {
        const colors =
          ChillFlightLogic && ChillFlightLogic.PLANE_COLORS
            ? ChillFlightLogic.PLANE_COLORS
            : [0xe0564c];
        const newColor = colors[colorSeed % colors.length];
        const balloon = createBalloonModel({
          planeColor: newColor,
          nightGlow: window.gearUp, // toggling gear in viewer triggers burner glow!
        });
        previewGroup.add(balloon);
        break;
      }

      // NATURE
      case 'pine':
      case 'deciduous':
      case 'tall_deciduous':
      case 'yellow_cortez':
      case 'cherry_blossom':
      case 'japanese_maple':
      case 'sculpted_pine':
      case 'birch':
      case 'broadleaf_oak':
      case 'oak':
      case 'magnolia':
      case 'snow_spruce':
      case 'mountain_rowan':
      case 'palm': {
        const variations = [-15, 0, 15];
        variations.forEach((xOffset, i) => {
          let trunkGeo, leavesGeo, baseHex;
          if (type === 'pine') {
            trunkGeo = treeTrunkGeo;
            leavesGeo = treeLeavesGeo;
            baseHex = 0x1b5e20;
          } else if (type === 'deciduous') {
            trunkGeo = deciduousGeos.trunk;
            leavesGeo = deciduousGeos.leaves;
            baseHex = 0x1b5e20;
          } else if (type === 'tall_deciduous') {
            trunkGeo = tallDeciduousGeos.trunk;
            leavesGeo = tallDeciduousGeos.leaves;
            baseHex = 0x1a451d; // Slightly darker green
          } else if (type === 'yellow_cortez') {
            trunkGeo = deciduousGeos.trunk;
            leavesGeo = deciduousGeos.leaves;
            baseHex = 0xffeb3b;
          } else if (type === 'cherry_blossom') {
            trunkGeo = cherryBlossomGeos.trunk;
            leavesGeo = cherryBlossomGeos.leaves;
            baseHex = 0xf7c9d6;
          } else if (type === 'japanese_maple') {
            trunkGeo = japaneseMapleGeos.trunk;
            leavesGeo = japaneseMapleGeos.leaves;
            baseHex = 0xb5433a;
          } else if (type === 'sculpted_pine') {
            trunkGeo = sculptedPineGeos.trunk;
            leavesGeo = sculptedPineGeos.leaves;
            baseHex = 0x7fa95c;
          } else if (type === 'birch') {
            trunkGeo = birchGeos.trunk;
            leavesGeo = birchGeos.leaves;
            baseHex = colorSeed % 2 === 1 ? 0xf39c12 : 0xb3d47f;
          } else if (type === 'broadleaf_oak') {
            trunkGeo = broadleafOakGeos.trunk;
            leavesGeo = broadleafOakGeos.leaves;
            baseHex = colorSeed % 2 === 1 ? 0xd35400 : 0x77b258;
          } else if (type === 'oak') {
            trunkGeo = oakGeos.trunk;
            leavesGeo = oakGeos.leaves;
            baseHex = colorSeed % 2 === 1 ? 0xc0392b : 0x7d8a5a;
          } else if (type === 'magnolia') {
            trunkGeo = magnoliaGeos.trunk;
            leavesGeo = magnoliaGeos.leaves;
            baseHex = 0xf2f2f2;
          } else if (type === 'snow_spruce') {
            trunkGeo = snowSpruceGeos.trunk;
            leavesGeo = snowSpruceGeos.leaves;
            baseHex = 0xf2f2f2;
          } else if (type === 'mountain_rowan') {
            trunkGeo = mountainRowanGeos.trunk;
            leavesGeo = mountainRowanGeos.leaves;
            baseHex = 0xf2f2f2;
          } else if (type === 'palm') {
            trunkGeo = palmGeos.trunk;
            leavesGeo = palmGeos.leaves;
            baseHex = 0x8fbf5a;
          }

          const trunk = new THREE.Mesh(trunkGeo, treeTrunkMat);

          const colorObj = new THREE.Color(baseHex);
          // Apply deterministic variations so they stay consistent
          const v = (i - 1) * 0.05; // -0.05, 0, 0.05
          colorObj.r = Math.max(0, Math.min(1, colorObj.r + v));
          colorObj.g = Math.max(0, Math.min(1, colorObj.g + v));
          colorObj.b = Math.max(0, Math.min(1, colorObj.b + v));

          const leaves = new THREE.Mesh(
            leavesGeo,
            createMaterial({
              color: colorObj.getHex(),
              vertexColors: true,
              flatShading: true,
              foliage: true,
            })
          );

          trunk.position.x = xOffset;
          leaves.position.x = xOffset;
          previewGroup.add(trunk, leaves);
        });
        break;
      }
      case 'fruit_trees': {
        const fruitVarieties = [
          appleTreeGeos,
          orchardAppleGeos,
          plumTreeGeos,
          fruitTreeGeos,
        ];
        fruitVarieties.forEach((geos, i) => {
          const xOffset = (i - (fruitVarieties.length - 1) / 2) * 14;
          const trunk = new THREE.Mesh(geos.trunk, treeTrunkMat);
          const leaves = new THREE.Mesh(
            geos.leaves,
            createMaterial({
              color: 0xf2f2f2,
              vertexColors: true,
              flatShading: true,
              foliage: true,
            })
          );
          trunk.position.x = xOffset;
          leaves.position.x = xOffset;
          previewGroup.add(trunk, leaves);
        });
        break;
      }
      case 'dead_tree': {
        [
          [deadTreeGeo, deadTreeMat, -18],
          [deadCottonwoodGeo, treeTrunkMat, 0],
          [twistedDeadOakGeo, treeTrunkMat, 18],
        ].forEach(([geo, mat, xOffset]) => {
          const m = new THREE.Mesh(geo, mat);
          m.position.x = xOffset;
          previewGroup.add(m);
        });
        break;
      }
      case 'swamp_trees': {
        const geos = buildSwampGeos();
        const mat = createMaterial({
          color: 0xffffff,
          vertexColors: true,
          flatShading: true,
        });
        const keys = [
          'swampCypress',
          'swampCypressMoss',
          'swampTupelo',
          'swampDeadOak',
          'swampSnag',
        ];
        keys.forEach((key, i) => {
          const m = new THREE.Mesh(geos[key], mat);
          m.position.x = (i - (keys.length - 1) / 2) * 18;
          previewGroup.add(m);
        });
        break;
      }
      case 'swamp_flora': {
        const geos = buildSwampGeos();
        const mat = createMaterial({
          color: 0xffffff,
          vertexColors: true,
          flatShading: true,
        });
        const keys = [
          'swampReeds',
          'swampCattails',
          'swampLilyPads',
          'swampLog',
          'swampStump',
        ];
        keys.forEach((key, i) => {
          const m = new THREE.Mesh(geos[key], mat);
          m.position.x = (i - (keys.length - 1) / 2) * 8;
          previewGroup.add(m);
        });
        break;
      }
      case 'cactus':
        previewGroup.add(new THREE.Mesh(cactusGeo, cactusMat));
        break;
      case 'ice_hut':
        ICE_HUT_COLORS.forEach((color, i) => {
          const body = new THREE.Mesh(iceHutGeos.body, createMaterial({color}));
          const roof = new THREE.Mesh(iceHutGeos.roof, iceHutRoofMat);
          body.position.x = roof.position.x = (i - 2) * 10;
          previewGroup.add(body, roof);
        });
        break;
      case 'sheep':
        SHEEP_WOOL_COLORS.forEach((color, i) => {
          const wool = new THREE.Mesh(
            sheepGeos.wool,
            createMaterial({color, flatShading: true})
          );
          const dark = new THREE.Mesh(sheepGeos.dark, sheepDarkMat);
          wool.position.x = dark.position.x = i * 4 - 6;
          wool.rotation.y = dark.rotation.y = i * 0.6;
          previewGroup.add(wool, dark);
        });
        break;
      case 'goats_deer':
        [
          [goatGeos, GOAT_COLORS, -4],
          [deerGeos, DEER_COLORS, 4],
        ].forEach(([geos, colors, z]) => {
          colors.forEach((color, i) => {
            const coat = new THREE.Mesh(
              geos.coat,
              createMaterial({color, flatShading: true})
            );
            const dark = new THREE.Mesh(geos.dark, sheepDarkMat);
            coat.position.set(i * 3.5 - 7, 0, z);
            dark.position.copy(coat.position);
            coat.rotation.y = dark.rotation.y = 1.2 + i * 0.3;
            previewGroup.add(coat, dark);
          });
        });
        break;
      case 'buoy':
        [0xc8372d, 0x2f8a52].forEach((color, i) => {
          const body = new THREE.Mesh(
            buoyGeos.body,
            createMaterial({color, flatShading: true})
          );
          const top = new THREE.Mesh(buoyGeos.top, buoyTopMat);
          body.position.x = top.position.x = i * 6 - 3;
          previewGroup.add(body, top);
        });
        break;
      case 'mast': {
        // The radio mast on the peaks (beacons.js), drawn smaller
        const mast = new THREE.Mesh(
          mastGeometry(),
          createMaterial({vertexColors: true, flatShading: true})
        );
        mast.material.side = THREE.DoubleSide;
        mast.scale.setScalar(0.25);
        previewGroup.add(mast);
        break;
      }
      case 'seal':
        previewGroup.add(new THREE.Mesh(sealGeo, sealMat));
        break;
      case 'north_barns':
        // The timber barn and the alpine hay barn, walls and roof
        // (farm-models.js)
        [
          [timberBarnBodyGeo, timberBarnRoofGeo, -11],
          [hayBarnBodyGeo, hayBarnRoofGeo, 11],
        ].forEach(([body, roof, x]) => {
          for (const geo of [body, roof]) {
            const m = new THREE.Mesh(geo, barnMat);
            m.position.x = x;
            previewGroup.add(m);
          }
        });
        break;
      case 'tractors': {
        // Each paint scheme, side by side at the game's scale
        // (farm-models.js)
        const geos = Object.values(buildTractorGeos());
        geos.forEach((geo, i) => {
          const m = new THREE.Mesh(geo, boatMat);
          m.position.x = (i - (geos.length - 1) / 2) * 6;
          previewGroup.add(m);
        });
        break;
      }
      case 'landmark_towers': {
        // Fire lookout, water tower and windpump side by side at the
        // game's scale (building-models.js)
        const geos = Object.values(
          buildLandmarkGeos(['fireLookout', 'waterTower', 'windpump'])
        );
        geos.forEach((geo, i) => {
          const m = new THREE.Mesh(geo, buildingMat);
          m.position.x = (i - (geos.length - 1) / 2) * 20;
          previewGroup.add(m);
        });
        break;
      }
      case 'dinosaur_skull': {
        // Rex, Triceratops and Sauropod skulls side by side at the
        // game's scale (colour button cycles their bone schemes)
        const colorway =
          DINO_SKULL_COLORWAYS[colorSeed % DINO_SKULL_COLORWAYS.length];
        DINO_SKULL_SPECIES.forEach((species, i) => {
          const m = new THREE.Mesh(
            dinoSkullGeo(species, colorway),
            buildingMat
          );
          m.position.x = (i - (DINO_SKULL_SPECIES.length - 1) / 2) * 20;
          previewGroup.add(m);
        });
        break;
      }
      case 'camp_trailers': {
        // The campers' trailers side by side, with a tent for scale
        const geos = Object.values(buildLandmarkGeos(LANDMARK_SMALL));
        geos.push(buildTentGeos()[0]);
        geos.forEach((geo, i) => {
          const m = new THREE.Mesh(geo, buildingMat);
          m.position.x = (i - (geos.length - 1) / 2) * 14;
          previewGroup.add(m);
        });
        break;
      }
      case 'mill_taverns': {
        // Water mill, village tavern and cove tavern, walls and roof,
        // side by side at the game's scale (a farmhouse for scale)
        const types = [
          'waterMill',
          'villageTavern',
          'coveTavern',
          'farmhouse0',
        ];
        const geos = buildLandmarkGeos(types);
        types.forEach((type, i) => {
          for (const part of ['Body', 'Roof']) {
            const m = new THREE.Mesh(geos[type + part], buildingMat);
            m.position.x = (i - (types.length - 1) / 2) * 40;
            previewGroup.add(m);
          }
        });
        break;
      }
      case 'cabins_cottages': {
        // Log cabins and cottages, walls and roof, side by side at the
        // game's scale (a farmhouse for scale)
        const types = [
          'logCabin0',
          'logCabin1',
          'thatchedCottage',
          'roadCottage',
          'farmhouse0',
        ];
        const geos = buildLandmarkGeos(types);
        types.forEach((type, i) => {
          for (const part of ['Body', 'Roof']) {
            const m = new THREE.Mesh(geos[type + part], buildingMat);
            m.position.x = (i - (types.length - 1) / 2) * 34;
            previewGroup.add(m);
          }
        });
        break;
      }
      case 'landmark_houses': {
        // Walls and roof of each, side by side at the game's scale
        // (building-models.js)
        const geos = buildLandmarkGeos(LANDMARK_HOUSES);
        LANDMARK_HOUSES.forEach((type, i) => {
          for (const part of ['Body', 'Roof']) {
            const m = new THREE.Mesh(geos[type + part], buildingMat);
            m.position.x = (i - (LANDMARK_HOUSES.length - 1) / 2) * 24;
            previewGroup.add(m);
          }
        });
        break;
      }
      case 'small_boats': {
        // Rowboats, fishing boats (two schemes each) and
        // the sunken one, side by side at the game's scale, waterline
        // at y = 0 (boat-models.js)
        const geos = Object.values(buildSmallBoatGeos());
        geos.forEach((geo, i) => {
          const m = new THREE.Mesh(geo, boatMat);
          m.position.x = (i - (geos.length - 1) / 2) * 8;
          previewGroup.add(m);
        });
        break;
      }
      case 'road_vehicles':
        // Every kind the road traffic drives, side by side at the
        // game's scale (colour button cycles their paint schemes)
        ROAD_VEHICLES.forEach((kind, i) => {
          const scheme = kind.colorways[colorSeed % kind.colorways.length];
          const {asset} = buildRoadVehicle(kind, scheme);
          asset.scale.setScalar(ROAD_VEHICLE_SCALE);
          asset.position.x = (i - (ROAD_VEHICLES.length - 1) / 2) * 7;
          previewGroup.add(asset);
        });
        break;
      case 'dolphin': {
        // Drawn at the game's scale (dolphins.js)
        const {group} = createDolphinModel();
        group.scale.setScalar(2.6);
        previewGroup.add(group);
        break;
      }
      case 'fallen_log': {
        const log = new THREE.Mesh(fallenLogGeo, fallenLogMat);
        const stump = new THREE.Mesh(stumpGeo, buildingMat);
        stump.position.set(4, 0, 7);
        previewGroup.add(log, stump);
        break;
      }
      case 'hay_bale':
        for (const [x, z, r] of [
          [0, 0, 0],
          [6, 1, 0.2],
          [2, 7, 1.4],
        ]) {
          const m = new THREE.Mesh(hayBaleGeo, hayBaleMat);
          m.position.set(x, 0, z);
          m.rotation.y = r;
          previewGroup.add(m);
        }
        break;
      case 'joshua_tree':
        previewGroup.add(
          new THREE.Mesh(joshuaGeos.trunk, joshuaTrunkMat),
          new THREE.Mesh(
            joshuaGeos.leaves,
            createMaterial({color: JOSHUA_LEAF_COLOR})
          )
        );
        break;
      case 'bush': {
        const variations = [-10, 0, 10];
        variations.forEach((xOffset, i) => {
          const colorObj = new THREE.Color(0x558b2f);
          const v = (i - 1) * 0.075; // -0.075, 0, 0.075
          colorObj.r = Math.max(0, Math.min(1, colorObj.r + v));
          colorObj.g = Math.max(0, Math.min(1, colorObj.g + v));
          colorObj.b = Math.max(0, Math.min(1, colorObj.b + v));

          const bMesh = new THREE.Mesh(
            bushGeo,
            createMaterial({color: colorObj.getHex()})
          );
          bMesh.position.x = xOffset;
          previewGroup.add(bMesh);
        });
        break;
      }
      case 'mushroom': {
        const variations = [-15, 0, 15];
        variations.forEach((xOffset, i) => {
          const stalk = new THREE.Mesh(mushroomGeos.trunk, mushroomStalkMat);
          const capPalettes = [
            0x9c27b0, 0xab47bc, 0x7b1fa2, 0x00bcd4, 0x26a69a, 0xe91e63,
          ];
          const baseHex = capPalettes[colorSeed % capPalettes.length];
          const colorObj = new THREE.Color(baseHex);
          const v = (i - 1) * 0.08;
          colorObj.r = Math.max(0, Math.min(1, colorObj.r + v));
          colorObj.g = Math.max(0, Math.min(1, colorObj.g + v));
          colorObj.b = Math.max(0, Math.min(1, colorObj.b + v));

          const cap = new THREE.Mesh(
            mushroomGeos.leaves,
            createMaterial({color: colorObj.getHex()})
          );

          const scale = [0.8, 1.2, 1.8][i];
          stalk.scale.set(scale, scale, scale);
          cap.scale.set(scale, scale, scale);

          stalk.position.x = xOffset;
          cap.position.x = xOffset;
          previewGroup.add(stalk, cap);
        });
        break;
      }
      case 'crystal': {
        const palette = [0xff4fd8, 0xff7a3d, 0xffb8ec, 0xc04dff, 0xff2e7e];
        [-30, 0, 30].forEach((xOffset, i) => {
          const mat = crystalMat.clone();
          mat.color.setHex(palette[(colorSeed + i) % palette.length]);
          const cluster = new THREE.Mesh(crystalClusterGeo, mat);
          const scale = [0.8, 1.4, 2.2][i];
          cluster.scale.set(scale, scale, scale);
          cluster.position.x = xOffset;
          previewGroup.add(cluster);
        });
        break;
      }
      case 'rock':
        previewGroup.add(new THREE.Mesh(rockGeo, rockMat));
        break;
      case 'rock_arch': {
        const geos = createRockArchGeometries(ChillFlightLogic.mulberry32(42));
        previewGroup.userData.blocks = geos.blocks;
        previewGroup.add(new THREE.Mesh(geos.rock, rockMat));
        break;
      }
      // The arches to fly under (arches.js), on flat ground at 0
      case 'sea_arch':
      case 'sea_arch_snow':
      case 'canyon_bridge':
      case 'gorge_bridge':
      case 'basalt_gate': {
        const rand = ChillFlightLogic.mulberry32(7);
        const arch =
          type === 'sea_arch' || type === 'sea_arch_snow'
            ? seaArch(0, 0, 0, 0, rand)
            : type === 'canyon_bridge'
              ? canyonBridge(0, 0, 0, -160, 160, 0, 150, rand)
              : type === 'gorge_bridge'
                ? canyonBridge(0, 0, 0, -180, 180, 0, 200, rand, 'gorge')
                : basaltGate(0, 0, 0, -190, 190, 0, 10, 62, 0.4);
        if (type === 'sea_arch_snow') arch.snow = 1;
        previewGroup.add(
          new THREE.Mesh(
            archGeometry(arch, () => 0),
            createMaterial({vertexColors: true, flatShading: true})
          )
        );
        break;
      }
      case 'rock_arch_grass': {
        const geos = createRockArchGeometries(ChillFlightLogic.mulberry32(42));
        previewGroup.userData.blocks = geos.blocks;
        previewGroup.add(new THREE.Mesh(geos.rock, rockMat));
        previewGroup.add(
          new THREE.Mesh(geos.grass, createMaterial({color: 0x7cb342}))
        );
        break;
      }
      case 'lily_pad':
        previewGroup.add(new THREE.Mesh(lilyPadGeo, lilyPadMat));
        break;
      case 'snowman':
        previewGroup.add(new THREE.Mesh(snowmanGeos.body, snowmanBodyMat));
        previewGroup.add(new THREE.Mesh(snowmanGeos.nose, snowmanNoseMat));
        break;
      case 'castle':
        previewGroup.add(new THREE.Mesh(castleRuinsGeo, castleRuinsMat));
        break;
      case 'dragon_skeleton': {
        const colorway = DRAGON_COLORWAYS[colorSeed % DRAGON_COLORWAYS.length];
        previewGroup.add(
          new THREE.Mesh(dragonSkeletonGeo(colorway), buildingMat)
        );
        break;
      }
      case 'pier':
        previewGroup.add(new THREE.Mesh(pierDeckGeo, pierDeckMat));
        break;
      case 'pier_l':
        previewGroup.add(new THREE.Mesh(pierDeckLGeo, pierDeckMat));
        break;
      case 'bridge': {
        previewGroup.add(new THREE.Mesh(bridgeDeckGeo, bridgeDeckMat));
        if (bridgeGirderGeo) {
          previewGroup.add(
            new THREE.Mesh(bridgeGirderGeo, bridgeGirderMat || bridgePilingMat)
          );
        }

        const halfRoadW = ChillFlightLogic.ROAD_WIDTH + 1.4;
        [-halfRoadW, halfRoadW].forEach((xOff) => {
          const rail = new THREE.Mesh(bridgeRailGeo, bridgePilingMat);
          rail.position.set(xOff, 2.05, 0);
          previewGroup.add(rail);
        });

        if (bridgePierCapGeo) {
          const cap = new THREE.Mesh(bridgePierCapGeo, bridgePilingMat);
          cap.position.set(0, 0, 0);
          previewGroup.add(cap);
        }

        if (bridgePierShaftGeo) {
          const shaft = new THREE.Mesh(bridgePierShaftGeo, bridgePilingMat);
          shaft.position.set(0, -7.0, 0);
          shaft.scale.set(1, 20, 1);
          previewGroup.add(shaft);
        }

        if (bridgePierFootingGeo) {
          const footing = new THREE.Mesh(bridgePierFootingGeo, bridgePilingMat);
          footing.position.set(0, -27.0 + 1.5, 0);
          previewGroup.add(footing);
        }
        break;
      }
      case 'tent': {
        // Polyfork camp tent, its colour by the seed
        previewGroup.add(
          new THREE.Mesh(tentGeos[colorSeed % tentGeos.length], tentMat)
        );
        break;
      }
    }
  }

  previewGroup.traverse((child) => {
    if (child.isMesh) {
      child.castShadow = true;
      child.receiveShadow = true;
    }
  });

  // Center and scale
  const box = new THREE.Box3().setFromObject(previewGroup);
  const center = new THREE.Vector3();
  box.getCenter(center);
  const size = new THREE.Vector3();
  box.getSize(size);

  const maxDim = Math.max(size.x, size.y, size.z);
  const scale = maxDim > 0 ? 15 / maxDim : 1;

  previewGroup.scale.setScalar(scale);

  // Re-calculate box after scale to get accurate offset
  const scaledBox = new THREE.Box3().setFromObject(previewGroup);
  const scaledCenter = new THREE.Vector3();
  scaledBox.getCenter(scaledCenter);

  previewGroup.position.sub(scaledCenter);
  previewGroup.position.y += (size.y * scale) / 2; // Sit on grid

  window.currentModel = previewGroup;
  viewScene.add(window.currentModel);

  // Update stats
  let vertices = 0;
  let triangles = 0;
  previewGroup.traverse((child) => {
    if (child.isMesh) {
      vertices += child.geometry.attributes.position.count;
      if (child.geometry.index) {
        triangles += child.geometry.index.count / 3;
      } else {
        triangles += child.geometry.attributes.position.count / 3;
      }
    }
  });
  document.getElementById('model-stats').innerText =
    `${Math.round(vertices)} vertices | ${Math.round(triangles)} triangles`;

  // Adjust camera to fit
  const finalBox = new THREE.Box3().setFromObject(previewGroup);
  const finalCenter = new THREE.Vector3();
  finalBox.getCenter(finalCenter);
  const finalSize = new THREE.Vector3();
  finalBox.getSize(finalSize);

  const frontFacingTypes = [
    'airplane',
    'biplane',
    'jet',
    'twin',
    'twin-engine',
    'twin_engine',
    'buggy',
    'sailboat',
    'pirateship',
    'hawk',
    'seagull',
    'goose',
  ];
  const isFrontFacing = frontFacingTypes.includes(type);
  const maxDimension = Math.max(finalSize.x, finalSize.y, finalSize.z);
  const distanceMultiplier = isFrontFacing ? 1.2 : 1.5;
  const distance = maxDimension * distanceMultiplier;

  if (!keepCamera && controls) {
    controls.reset();
    controls.target.copy(finalCenter);
    if (isFrontFacing) {
      camera.position.set(distance * 0.92, distance * 0.58, -distance * 0.82);
    } else {
      camera.position.set(distance, distance, distance);
    }
    controls.update();
  }
}

let lastAnimTime = performance.now();
function animate() {
  if (!renderer) return;
  requestAnimationFrame(animate);
  const now = performance.now();
  const delta = Math.min(0.1, (now - lastAnimTime) * 0.001);
  lastAnimTime = now;

  const time = now * 0.001;
  animationUniforms.uTime.value = time;
  waterUniforms.uTime.value = time;

  if (activeDestruction) {
    activeDestruction.update(delta);
  }

  controls?.update();
  renderer.render(viewScene, camera);
}

window.addEventListener('resize', () => {
  if (!renderer) return;
  camera.aspect = container.clientWidth / container.clientHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(container.clientWidth, container.clientHeight);
});

window.addEventListener('hashchange', () => {
  const hash = window.location.hash.substring(1);
  if (hash) viewModel(hash);
});

// Expose globally before initial load
window.viewModel = viewModel;
window.cycleColors = cycleColors;
window.toggleGear = toggleGear;
window.toggleDestruction = toggleDestruction;

// Start
animate();

// Initial load
setTimeout(() => {
  const hash = window.location.hash.substring(1);
  if (hash) {
    viewModel(hash);
  } else if (window.__pendingViewModel) {
    const pending = window.__pendingViewModel;
    window.__pendingViewModel = null;
    viewModel(pending.type, null, pending.colorSeed || 0);
  } else {
    // Default to airplane
    const firstBtn = document.querySelector('.model-btn');
    if (firstBtn) firstBtn.click();
  }
}, 50);
