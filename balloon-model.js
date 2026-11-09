// --- HOT AIR BALLOON MODEL ---
// Procedural low-poly hot air balloon model:
// - Faceted teardrop envelope with 16 radial gores (alternating livery stripes)
// - Wicker gondola/basket with rim lip, interior floor, corner posts, and hanging sandbags
// - 4 suspension cables connecting the basket to the envelope throat
// - Center burner assembly with dual nozzles, glowing flame, and internal PointLight
// - Projected decal emblem support on the equator via balloon-decals.js
// - Modular LOD groups (LOD 0 near, LOD 1 mid, LOD 2 distant silhouette)
import * as THREE from 'three';
import {createMaterial} from './constants.js';
import {state} from './state.js';
import {softenAnimeLight} from './art-style.js';
import {getEmblemTexture, projectDecal} from './balloon-decals.js';

export function createBalloonModel(opts = {}) {
  const root = new THREE.Group();
  root.name = 'balloon-model';

  const makeMat = (props) => createMaterial(props);

  const planeColor =
    opts.planeColor !== undefined
      ? opts.planeColor
      : typeof state.planeColor !== 'undefined'
        ? state.planeColor
        : 0xe0564c; // Coral-red default

  const whiteColor = planeColor === 0xe8c382 ? 0x1c3144 : 0xf8fafc;

  const accentMat =
    opts.planeMat ||
    makeMat({
      color: planeColor,
      flatShading: true,
      roughness: 0.45,
    });

  const bodyMat =
    opts.planeWhiteMat ||
    makeMat({
      color: whiteColor,
      flatShading: true,
      roughness: 0.45,
    });

  const wickerMat = makeMat({
    color: 0x936538,
    flatShading: true,
    roughness: 0.85,
  });

  const wickerDarkMat = makeMat({
    color: 0x5a3d1f,
    flatShading: true,
    roughness: 0.9,
  });

  const sandbagMat = makeMat({
    color: 0xd2ba8a,
    flatShading: true,
    roughness: 0.8,
  });

  const metalMat = makeMat({
    color: 0x475569,
    flatShading: true,
    roughness: 0.4,
    metalness: 0.3,
  });

  const burnerFlameMat = new THREE.MeshBasicMaterial({
    color: 0xff7700,
    transparent: true,
    opacity: 0.9,
  });

  // Tag materials for model debug viewer
  accentMat.userData = {type: 'accent'};
  bodyMat.userData = {type: 'body'};

  // ==========================================
  // 1. ENVELOPE (Faceted 16-gore teardrop loft)
  // ==========================================
  const rings = [
    {y: 25.2, r: 0.2}, // 0: Crown apex cap
    {y: 24.6, r: 2.8}, // 1: Upper dome
    {y: 22.8, r: 5.8}, // 2: Shoulder
    {y: 20.0, r: 7.5}, // 3: Upper equator
    {y: 16.8, r: 8.0}, // 4: Equator (widest)
    {y: 13.2, r: 7.2}, // 5: Lower belly
    {y: 9.8, r: 5.4}, // 6: Lower taper
    {y: 6.8, r: 3.5}, // 7: Throat funnel
    {y: 4.8, r: 2.3}, // 8: Throat collar
    {y: 4.2, r: 2.1}, // 9: Bottom skirt rim
  ];

  const segments = 16;
  const positions = [];
  const normals = [];
  const uvs = [];
  const indices0 = []; // Accent gore indices
  const indices1 = []; // Body gore indices

  // Generate vertices
  for (let i = 0; i < rings.length; i++) {
    const ring = rings[i];
    const v = i / (rings.length - 1);
    for (let j = 0; j <= segments; j++) {
      const angle = (j / segments) * Math.PI * 2;
      const x = Math.sin(angle) * ring.r;
      const z = Math.cos(angle) * ring.r;
      positions.push(x, ring.y, z);
      normals.push(x, 0.2, z);
      uvs.push(j / segments, v);
    }
  }

  // Generate faces separated by gore stripes
  const stride = segments + 1;
  for (let i = 0; i < rings.length - 1; i++) {
    for (let j = 0; j < segments; j++) {
      const a = i * stride + j;
      const b = (i + 1) * stride + j;
      const c = (i + 1) * stride + (j + 1);
      const d = i * stride + (j + 1);

      const targetIndices = j % 2 === 0 ? indices0 : indices1;
      targetIndices.push(a, b, d);
      targetIndices.push(b, c, d);
    }
  }

  const envelopeGeo = new THREE.BufferGeometry();
  envelopeGeo.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(positions, 3)
  );
  envelopeGeo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));

  // Merge indices into single buffer with material groups
  const allIndices = [...indices0, ...indices1];
  envelopeGeo.setIndex(allIndices);
  envelopeGeo.addGroup(0, indices0.length, 0);
  envelopeGeo.addGroup(indices0.length, indices1.length, 1);
  envelopeGeo.computeVertexNormals();

  const envelopeMesh = new THREE.Mesh(envelopeGeo, [accentMat, bodyMat]);
  envelopeMesh.castShadow = true;
  envelopeMesh.receiveShadow = false;
  root.add(envelopeMesh);
  root.userData.envelope = envelopeMesh;

  // Crown cap button on top
  const crownGeo = new THREE.CylinderGeometry(0.8, 1.2, 0.4, 8);
  crownGeo.translate(0, 25.3, 0);
  const crownMesh = new THREE.Mesh(crownGeo, wickerDarkMat);
  root.add(crownMesh);

  // Bottom skirt ring collar
  const skirtGeo = new THREE.CylinderGeometry(2.1, 2.25, 0.4, 16);
  skirtGeo.translate(0, 4.2, 0);
  const skirtMesh = new THREE.Mesh(skirtGeo, wickerDarkMat);
  root.add(skirtMesh);

  // ==========================================
  // 2. WICKER BASKET (Gondola)
  // ==========================================
  const basketGroup = new THREE.Group();
  root.add(basketGroup);

  const bSize = 2.6;
  const bHeight = 1.9;
  const bThick = 0.22;

  // Basket floor
  const floorGeo = new THREE.BoxGeometry(bSize, 0.25, bSize);
  floorGeo.translate(0, 0.125, 0);
  const floorMesh = new THREE.Mesh(floorGeo, wickerDarkMat);
  basketGroup.add(floorMesh);

  // 4 Basket walls
  const wallZGeo = new THREE.BoxGeometry(bSize, bHeight, bThick);
  const wallFront = new THREE.Mesh(wallZGeo, wickerMat);
  wallFront.position.set(0, bHeight / 2, -bSize / 2 + bThick / 2);
  const wallBack = new THREE.Mesh(wallZGeo, wickerMat);
  wallBack.position.set(0, bHeight / 2, bSize / 2 - bThick / 2);

  const wallXGeo = new THREE.BoxGeometry(
    bThick,
    bHeight,
    bSize - bThick * 2
  );
  const wallLeft = new THREE.Mesh(wallXGeo, wickerMat);
  wallLeft.position.set(-bSize / 2 + bThick / 2, bHeight / 2, 0);
  const wallRight = new THREE.Mesh(wallXGeo, wickerMat);
  wallRight.position.set(bSize / 2 - bThick / 2, bHeight / 2, 0);

  basketGroup.add(wallFront, wallBack, wallLeft, wallRight);

  // Rim lip around top
  const rimXGeo = new THREE.BoxGeometry(bSize + 0.16, 0.15, 0.3);
  const rimFront = new THREE.Mesh(rimXGeo, wickerDarkMat);
  rimFront.position.set(0, bHeight + 0.05, -bSize / 2 + bThick / 2);
  const rimBack = new THREE.Mesh(rimXGeo, wickerDarkMat);
  rimBack.position.set(0, bHeight + 0.05, bSize / 2 - bThick / 2);

  const rimZGeo = new THREE.BoxGeometry(0.3, 0.15, bSize - 0.2);
  const rimLeft = new THREE.Mesh(rimZGeo, wickerDarkMat);
  rimLeft.position.set(-bSize / 2 + bThick / 2, bHeight + 0.05, 0);
  const rimRight = new THREE.Mesh(rimZGeo, wickerDarkMat);
  rimRight.position.set(bSize / 2 - bThick / 2, bHeight + 0.05, 0);

  basketGroup.add(rimFront, rimBack, rimLeft, rimRight);

  // 4 Internal corner support posts
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const postGeo = new THREE.CylinderGeometry(0.08, 0.08, 1.3, 6);
      postGeo.translate(
        sx * (bSize * 0.44),
        bHeight + 0.65,
        sz * (bSize * 0.44)
      );
      const postMesh = new THREE.Mesh(postGeo, metalMat);
      basketGroup.add(postMesh);
    }
  }

  // ==========================================
  // 3. SUSPENSION RIGGING CABLES (LOD Modular)
  // ==========================================
  const cablesGroup = new THREE.Group();
  cablesGroup.name = 'balloon-cables';
  root.add(cablesGroup);

  const cableCorners = [
    {bx: -bSize * 0.44, bz: -bSize * 0.44, ex: -1.3, ez: -1.3},
    {bx: bSize * 0.44, bz: -bSize * 0.44, ex: 1.3, ez: -1.3},
    {bx: -bSize * 0.44, bz: bSize * 0.44, ex: -1.3, ez: 1.3},
    {bx: bSize * 0.44, bz: bSize * 0.44, ex: 1.3, ez: 1.3},
  ];

  for (const c of cableCorners) {
    const start = new THREE.Vector3(c.bx, bHeight + 1.25, c.bz);
    const end = new THREE.Vector3(c.ex, 4.2, c.ez);
    const dist = start.distanceTo(end);
    const cableGeo = new THREE.CylinderGeometry(0.035, 0.035, dist, 5);
    const mid = new THREE.Vector3().addVectors(start, end).multiplyScalar(0.5);
    const dir = new THREE.Vector3().subVectors(end, start).normalize();
    const quat = new THREE.Quaternion().setFromUnitVectors(
      new THREE.Vector3(0, 1, 0),
      dir
    );
    const cableMesh = new THREE.Mesh(cableGeo, metalMat);
    cableMesh.position.copy(mid);
    cableMesh.quaternion.copy(quat);
    cablesGroup.add(cableMesh);
  }

  // ==========================================
  // 4. HANGING SANDBAGS (LOD Modular)
  // ==========================================
  const sandbagsGroup = new THREE.Group();
  sandbagsGroup.name = 'balloon-sandbags';
  root.add(sandbagsGroup);

  for (const side of [-1, 1]) {
    const bagGeo = new THREE.SphereGeometry(0.28, 6, 5);
    bagGeo.scale(1, 1.4, 0.8);
    const bagMesh = new THREE.Mesh(bagGeo, sandbagMat);
    bagMesh.position.set(side * (bSize * 0.54), bHeight * 0.55, 0);
    sandbagsGroup.add(bagMesh);

    const tieGeo = new THREE.CylinderGeometry(0.04, 0.04, 0.35, 4);
    const tieMesh = new THREE.Mesh(tieGeo, wickerDarkMat);
    tieMesh.position.set(
      side * (bSize * 0.52),
      bHeight * 0.55 + 0.32,
      0
    );
    sandbagsGroup.add(tieMesh);
  }

  // ==========================================
  // 5. BURNER ASSEMBLY & WARM FLAME LIGHT
  // ==========================================
  const burnerGroup = new THREE.Group();
  burnerGroup.position.set(0, 3.2, 0);
  root.add(burnerGroup);

  // Dual burner cans
  for (const sx of [-0.22, 0.22]) {
    const canGeo = new THREE.CylinderGeometry(0.2, 0.16, 0.45, 8);
    const canMesh = new THREE.Mesh(canGeo, metalMat);
    canMesh.position.set(sx, 0, 0);
    burnerGroup.add(canMesh);
  }

  // Burner flame cone
  const flameGeo = new THREE.ConeGeometry(0.48, 1.6, 7);
  flameGeo.translate(0, 0.9, 0);
  const flameMesh = new THREE.Mesh(flameGeo, burnerFlameMat);
  flameMesh.visible = false;
  burnerGroup.add(flameMesh);

  // Internal PointLight for night-glow illumination
  const burnerLight = new THREE.PointLight(0xff9933, 0, 45, 1.5);
  burnerLight.position.set(0, 1.2, 0);
  burnerGroup.add(burnerLight);

  // ==========================================
  // 6. PROJECTED DECAL EMBLEM
  // ==========================================
  const decalGroup = new THREE.Group();
  decalGroup.name = 'balloon-decals';
  root.add(decalGroup);

  if (opts.decal !== false) {
    const emblemTexture = getEmblemTexture(opts.emblem || 'sunburst');
    if (emblemTexture) {
      // Project on the front equator (-Z face)
      const frontDecal = projectDecal(
        envelopeMesh,
        new THREE.Vector3(0, 16.8, -8.0),
        new THREE.Euler(0, 0, 0),
        new THREE.Vector3(6.5, 6.5, 3.0),
        emblemTexture
      );
      if (frontDecal) decalGroup.add(frontDecal);

      // Optionally project on the back (+Z face)
      const backDecal = projectDecal(
        envelopeMesh,
        new THREE.Vector3(0, 16.8, 8.0),
        new THREE.Euler(0, Math.PI, 0),
        new THREE.Vector3(6.5, 6.5, 3.0),
        emblemTexture
      );
      if (backDecal) decalGroup.add(backDecal);
    }
  }

  // ==========================================
  // 7. DYNAMIC HOOKS & CONTROLS
  // ==========================================
  root.userData.burnerActive = false;
  root.userData.setBurnerActive = (active, intensity = 1.0) => {
    root.userData.burnerActive = active;
    flameMesh.visible = active;
    if (active) {
      const scale = 0.7 + intensity * 0.4;
      flameMesh.scale.set(scale, scale * (0.9 + Math.random() * 0.25), scale);
      burnerLight.intensity = (opts.nightGlow ? 35 : 18) * intensity;
    } else {
      burnerLight.intensity = 0;
    }
  };

  // Modular LOD update
  root.userData.lodLevel = 0;
  root.userData.setLOD = (level) => {
    root.userData.lodLevel = level;
    if (level === 0) {
      // Near: full detail
      cablesGroup.visible = true;
      sandbagsGroup.visible = true;
      decalGroup.visible = true;
      burnerGroup.visible = true;
    } else if (level === 1) {
      // Mid: hide fine sub-pixel elements (cables, sandbags, decals)
      cablesGroup.visible = false;
      sandbagsGroup.visible = false;
      decalGroup.visible = false;
      burnerGroup.visible = true;
    } else {
      // Far: pure silhouette
      cablesGroup.visible = false;
      sandbagsGroup.visible = false;
      decalGroup.visible = false;
      burnerGroup.visible = false;
    }
  };

  root.userData.updateLOD = (distSq) => {
    if (distSq < 800 * 800) {
      if (root.userData.lodLevel !== 0) root.userData.setLOD(0);
    } else if (distSq < 2500 * 2500) {
      if (root.userData.lodLevel !== 1) root.userData.setLOD(1);
    } else {
      if (root.userData.lodLevel !== 2) root.userData.setLOD(2);
    }
  };

  // Shadow casting
  root.traverse((child) => {
    if (child.isMesh && child !== flameMesh) {
      child.castShadow = true;
      child.receiveShadow = false;
    }
  });
  softenAnimeLight(root);

  // Bounding & Camera metadata
  root.wheelDepth = 0; // basket sits at ground
  root.halfSpan = 8.0;
  root.noseLength = 8.0;
  root.cameraScale = 1.35;
  root.firstPersonEye = new THREE.Vector3(0, 1.5, 0);

  return root;
}
