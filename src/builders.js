// 메시 생성 헬퍼 — 지오메트리/머티리얼을 캐시해 드로우콜과 메모리를 아낀다.
import THREE from './three.js';

const geoCache = new Map();
const matCache = new Map();

function cachedGeo(key, make) {
  let g = geoCache.get(key);
  if (!g) {
    g = make();
    geoCache.set(key, g);
  }
  return g;
}

/** 스타일화된 무광 머티리얼 */
export function material(color, opts = {}) {
  const { roughness = 0.85, metalness = 0.02, flat = false, emissive, emissiveIntensity = 1, transparent, opacity } = opts;
  const key = `${color}|${roughness}|${metalness}|${flat}|${emissive ?? '-'}|${emissiveIntensity}|${transparent ? opacity : 'o'}`;
  let m = matCache.get(key);
  if (!m) {
    m = new THREE.MeshStandardMaterial({
      color,
      roughness,
      metalness,
      flatShading: flat,
      emissive: emissive === undefined ? 0x000000 : emissive,
      emissiveIntensity,
    });
    if (transparent) {
      m.transparent = true;
      m.opacity = opacity ?? 1;
    }
    matCache.set(key, m);
  }
  return m;
}

/** 발광 머티리얼 (이펙트용, 캐시하지 않음) */
export function emissiveMaterial(color, opacity = 1) {
  return new THREE.MeshBasicMaterial({
    color,
    transparent: opacity < 1,
    opacity,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
}

export function ellipsoid(rx, ry, rz, color, opts) {
  const seg = opts?.seg ?? 16;
  const geo = cachedGeo(`sph|${seg}`, () => new THREE.SphereGeometry(1, seg, Math.max(8, seg / 2)));
  const m = new THREE.Mesh(geo, material(color, opts));
  m.scale.set(rx, ry, rz);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

export function sphere(r, color, opts) {
  return ellipsoid(r, r, r, color, { seg: 14, ...opts });
}

/** Y축 캡슐 (joint 연결용) */
export function capsuleY(radius, length, color, opts) {
  const geo = cachedGeo(`capY|${radius}|${length}`, () => new THREE.CapsuleGeometry(radius, Math.max(0.001, length), 6, 14));
  const m = new THREE.Mesh(geo, material(color, opts));
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

/** Z축 캡슐 (몸통용) */
export function capsuleZ(radius, length, color, opts) {
  const geo = cachedGeo(`capZ|${radius}|${length}`, () => {
    const g = new THREE.CapsuleGeometry(radius, Math.max(0.001, length), 8, 18);
    g.rotateX(Math.PI / 2);
    return g;
  });
  const m = new THREE.Mesh(geo, material(color, opts));
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

export function box(w, h, d, color, opts) {
  const geo = cachedGeo(`box|${w}|${h}|${d}`, () => new THREE.BoxGeometry(w, h, d));
  const m = new THREE.Mesh(geo, material(color, opts));
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

export function cone(radius, height, color, opts) {
  const seg = opts?.seg ?? 10;
  const geo = cachedGeo(`cone|${radius}|${height}|${seg}`, () => new THREE.ConeGeometry(radius, height, seg));
  const m = new THREE.Mesh(geo, material(color, opts));
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

export function cylinder(rTop, rBottom, height, color, opts) {
  const seg = opts?.seg ?? 10;
  const geo = cachedGeo(`cyl|${rTop}|${rBottom}|${height}|${seg}`, () => new THREE.CylinderGeometry(rTop, rBottom, height, seg));
  const m = new THREE.Mesh(geo, material(color, opts));
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

export function group(x = 0, y = 0, z = 0) {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  return g;
}

export function add(parent, ...children) {
  children.forEach((c) => c && parent.add(c));
  return parent;
}

export const palette = {
  lion: { fur: 0xc79a5b, furLight: 0xe3c590, furDark: 0x8a5a2e, mane: 0x7a4a20, maneLight: 0xa06a2c, nose: 0x2a1d16, eye: 0x2a1a0c },
  wolf: { fur: 0x878d97, furLight: 0xc7ccd4, furDark: 0x4d535e, nose: 0x1a1a1e, eye: 0xf0b432 },
  bear: { fur: 0x5b4029, furLight: 0x8a6845, furDark: 0x3b2817, nose: 0x241812, eye: 0x2a1c10 },
  boar: { fur: 0x655544, furLight: 0x8a7a62, furDark: 0x3a2f24, nose: 0x3a2a24, eye: 0xd8342a },
  anaconda: { fur: 0x4c6b3a, furLight: 0xa9b083, furDark: 0x2c3d20, spot: 0x1b2414, eye: 0xd9a326 },
};
