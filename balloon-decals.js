// --- HOT AIR BALLOON DECALS ---
// Projects graphic emblems (sunbursts, chill clouds, mountains, compasses,
// or custom raster/canvas textures) onto curved balloon envelopes using
// DecalGeometry.
import * as THREE from 'three';
import {DecalGeometry} from 'three/addons/geometries/DecalGeometry.js';

const _cache = new Map();

// Helper to create a canvas texture in browser environments (gracefully returns null in Node)
function makeCanvasTexture(drawFn, key) {
  if (typeof document === 'undefined') return null;
  if (_cache.has(key)) return _cache.get(key);

  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, size, size);

  drawFn(ctx, size);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  _cache.set(key, texture);
  return texture;
}

// 1. Sunburst emblem (golden rays over rising sun)
export function getSunburstTexture() {
  return makeCanvasTexture((ctx, s) => {
    const c = s / 2;
    // Outer glow ring
    ctx.beginPath();
    ctx.arc(c, c, s * 0.44, 0, Math.PI * 2);
    ctx.lineWidth = s * 0.04;
    ctx.strokeStyle = '#ffffff';
    ctx.stroke();

    // Sun disc
    ctx.beginPath();
    ctx.arc(c, c, s * 0.22, 0, Math.PI * 2);
    ctx.fillStyle = '#ffcc00';
    ctx.fill();

    // 12 Sun rays
    for (let i = 0; i < 12; i++) {
      const a = (i * Math.PI) / 6;
      ctx.beginPath();
      ctx.moveTo(c + Math.cos(a) * (s * 0.26), c + Math.sin(a) * (s * 0.26));
      ctx.lineTo(c + Math.cos(a) * (s * 0.38), c + Math.sin(a) * (s * 0.38));
      ctx.lineWidth = s * 0.035;
      ctx.strokeStyle = '#ffcc00';
      ctx.stroke();
    }
  }, 'sunburst');
}

// 2. Chill Cloud emblem (happy puffy cloud with sunglasses/zen vibes)
export function getCloudEmblemTexture() {
  return makeCanvasTexture((ctx, s) => {
    const c = s / 2;
    // Circular badge background
    ctx.beginPath();
    ctx.arc(c, c, s * 0.44, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.25)';
    ctx.fill();
    ctx.lineWidth = s * 0.03;
    ctx.strokeStyle = '#ffffff';
    ctx.stroke();

    // Cloud puffs
    ctx.fillStyle = '#ffffff';
    const puff = (x, y, r) => {
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    };
    puff(c - s * 0.16, c + s * 0.04, s * 0.14);
    puff(c + s * 0.16, c + s * 0.04, s * 0.14);
    puff(c - s * 0.06, c - s * 0.08, s * 0.16);
    puff(c + s * 0.08, c - s * 0.06, s * 0.13);

    // Flat bottom of cloud
    ctx.fillRect(c - s * 0.2, c + s * 0.04, s * 0.4, s * 0.14);
  }, 'cloud');
}

// 3. Mountain Peak emblem
export function getMountainEmblemTexture() {
  return makeCanvasTexture((ctx, s) => {
    const c = s / 2;
    // Diamond badge border
    ctx.save();
    ctx.translate(c, c);
    ctx.rotate(Math.PI / 4);
    ctx.beginPath();
    ctx.rect(-s * 0.32, -s * 0.32, s * 0.64, s * 0.64);
    ctx.lineWidth = s * 0.035;
    ctx.strokeStyle = '#ffffff';
    ctx.stroke();
    ctx.restore();

    // Triangle peak
    ctx.beginPath();
    ctx.moveTo(c, c - s * 0.24);
    ctx.lineTo(c - s * 0.24, c + s * 0.18);
    ctx.lineTo(c + s * 0.24, c + s * 0.18);
    ctx.closePath();
    ctx.fillStyle = '#ffffff';
    ctx.fill();

    // Peak shadow slice
    ctx.beginPath();
    ctx.moveTo(c, c - s * 0.24);
    ctx.lineTo(c + s * 0.24, c + s * 0.18);
    ctx.lineTo(c, c + s * 0.18);
    ctx.closePath();
    ctx.fillStyle = 'rgba(0, 0, 0, 0.2)';
    ctx.fill();
  }, 'mountain');
}

export const EMBLEMS = ['sunburst', 'cloud', 'mountain'];

export function getEmblemTexture(name) {
  switch (name) {
    case 'cloud':
      return getCloudEmblemTexture();
    case 'mountain':
      return getMountainEmblemTexture();
    case 'sunburst':
    default:
      return getSunburstTexture();
  }
}

/**
 * Projects a decal onto the target mesh (e.g. envelope) using DecalGeometry.
 *
 * @param {THREE.Mesh} targetMesh - The envelope mesh to project onto
 * @param {THREE.Vector3} position - Center of decal in world/local space
 * @param {THREE.Euler} orientation - Orientation facing the surface normal
 * @param {THREE.Vector3} size - Bounding box [width, height, depth] of projection
 * @param {THREE.Texture} texture - Decal texture
 * @returns {THREE.Mesh|null} - The decal mesh ready to add to the balloon group
 */
export function projectDecal(
  targetMesh,
  position,
  orientation,
  size,
  texture
) {
  if (!targetMesh || !texture || typeof DecalGeometry === 'undefined') {
    return null;
  }

  try {
    const decalGeo = new DecalGeometry(
      targetMesh,
      position,
      orientation,
      size
    );

    const decalMat = new THREE.MeshBasicMaterial({
      map: texture,
      transparent: true,
      depthTest: true,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -4,
    });

    const decalMesh = new THREE.Mesh(decalGeo, decalMat);
    decalMesh.renderOrder = 1;
    return decalMesh;
  } catch {
    return null;
  }
}
