'use client';

import { useEffect, useRef, useCallback } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { SVGLoader } from 'three/examples/jsm/loaders/SVGLoader.js';
import type { ProductParams, ProfileStyle } from '@/lib/types';

interface Props {
  params: ProductParams | null;
}

// ─── Profile shape builders ───────────────────────────────────────────────────

function buildPlintaShape(h: number, t: number, style: ProfileStyle): THREE.Shape {
  const shape = new THREE.Shape();

  if (style === 'rounded') {
    const r = t * 0.35;
    shape.moveTo(0, 0);
    shape.lineTo(t, 0);
    shape.lineTo(t, h - r);
    shape.quadraticCurveTo(t, h, t - r, h);
    shape.lineTo(0, h);
    shape.closePath();
  } else if (style === 'stepped') {
    const s = t * 0.28;
    shape.moveTo(0, 0);
    shape.lineTo(t, 0);
    shape.lineTo(t, h * 0.35);
    shape.lineTo(t - s, h * 0.35);
    shape.lineTo(t - s, h * 0.65);
    shape.lineTo(t - s * 2, h * 0.65);
    shape.lineTo(t - s * 2, h);
    shape.lineTo(0, h);
    shape.closePath();
  } else if (style === 'classical') {
    shape.moveTo(0, 0);
    shape.lineTo(t, 0);
    shape.lineTo(t, h * 0.12);
    // ogee outward curve
    shape.bezierCurveTo(t, h * 0.28, t * 0.6, h * 0.32, t * 0.75, h * 0.48);
    // S-curve inward
    shape.bezierCurveTo(t * 0.9, h * 0.64, t * 0.55, h * 0.72, t * 0.55, h * 0.82);
    // small shelf
    shape.lineTo(t * 0.3, h * 0.9);
    shape.quadraticCurveTo(t * 0.1, h * 0.94, 0, h);
    shape.closePath();
  } else if (style === 'modern') {
    const r = t * 0.12;
    shape.moveTo(0, 0);
    shape.lineTo(t, 0);
    shape.lineTo(t, h - r * 3);
    shape.quadraticCurveTo(t, h, 0, h);
    shape.closePath();
  } else {
    // straight
    shape.moveTo(0, 0);
    shape.lineTo(t, 0);
    shape.lineTo(t, h);
    shape.lineTo(0, h);
    shape.closePath();
  }

  return shape;
}

function buildCornisaShape(h: number, t: number, style: ProfileStyle): THREE.Shape {
  const shape = new THREE.Shape();

  if (style === 'classical') {
    shape.moveTo(0, 0);
    shape.lineTo(t, 0);
    shape.lineTo(t, h * 0.08);
    shape.bezierCurveTo(t, h * 0.25, t * 0.5, h * 0.35, t * 0.65, h * 0.5);
    shape.bezierCurveTo(t * 0.8, h * 0.65, t * 0.15, h * 0.75, t * 0.15, h * 0.88);
    shape.lineTo(t * 0.05, h * 0.95);
    shape.lineTo(0, h);
    shape.closePath();
  } else if (style === 'modern') {
    shape.moveTo(0, 0);
    shape.lineTo(t, 0);
    shape.quadraticCurveTo(t, h, 0, h);
    shape.closePath();
  } else if (style === 'rounded') {
    shape.moveTo(0, 0);
    shape.lineTo(t, 0);
    shape.lineTo(t, h * 0.3);
    shape.bezierCurveTo(t * 0.7, h * 0.5, t * 0.3, h * 0.7, 0, h);
    shape.closePath();
  } else {
    // straight - diagonal cut
    shape.moveTo(0, 0);
    shape.lineTo(t, 0);
    shape.lineTo(0, h);
    shape.closePath();
  }

  return shape;
}

// Traces an uploaded sketch's largest closed region (CDR/PDF/JPG, already converted to SVG
// server-side) into a Shape, rescaled to span [0, spanX] x [0, spanY] in the same local-axis
// convention as the preset profile builders above (X = thickness/width, Y = height, base at Y=0).
function buildShapeFromSVG(svgText: string, spanX: number, spanY: number): THREE.Shape | null {
  let paths: THREE.ShapePath[];
  try {
    paths = new SVGLoader().parse(svgText).paths;
  } catch {
    return null;
  }

  // Collect every candidate shape with its area and bounding box first — picking by area alone
  // (the simplest heuristic) backfires on real CAD/PDF exports, where a drawing border or title
  // block is routinely the single largest shape on the page, dwarfing the actual profile outline.
  const candidates: { shape: THREE.Shape; area: number; box: THREE.Box2 }[] = [];
  for (const shapePath of paths) {
    for (const candidate of SVGLoader.createShapes(shapePath)) {
      const pts = candidate.getPoints(64);
      const area = Math.abs(THREE.ShapeUtils.area(pts));
      if (area <= 0) continue;
      const box = new THREE.Box2().setFromPoints(pts);
      candidates.push({ shape: candidate, area, box });
    }
  }
  if (candidates.length === 0) return null;

  // A page-spanning border/frame covers almost the full extent of everything drawn; exclude any
  // candidate that dominates the overall bounding box that way, unless it's all there is.
  const overall = new THREE.Box2();
  for (const c of candidates) overall.union(c.box);
  const overallArea = (overall.max.x - overall.min.x) * (overall.max.y - overall.min.y);
  const real = candidates.filter((c) => overallArea <= 0 || c.area / overallArea < 0.85);
  const pool = real.length > 0 ? real : candidates;

  let best: THREE.Shape | null = null;
  let bestArea = 0;
  for (const c of pool) {
    if (c.area > bestArea) {
      bestArea = c.area;
      best = c.shape;
    }
  }
  if (!best) return null;

  const pts = best.getPoints(128);
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const p of pts) {
    minX = Math.min(minX, p.x);
    maxX = Math.max(maxX, p.x);
    minY = Math.min(minY, p.y);
    maxY = Math.max(maxY, p.y);
  }
  const sx = spanX / (maxX - minX || 1);
  const sy = spanY / (maxY - minY || 1);

  // SVG's Y axis points down; flip it so the traced profile stands upright (base at Y=0).
  const remapped = new THREE.Shape();
  pts.forEach((p, i) => {
    const x = (p.x - minX) * sx;
    const y = spanY - (p.y - minY) * sy;
    if (i === 0) remapped.moveTo(x, y);
    else remapped.lineTo(x, y);
  });
  remapped.closePath();

  return remapped;
}

// The 2D cross-section profile is shared by the 3D extrusion and the DXF sketch export,
// so both always represent the exact same shape (preset style or traced upload alike).
function getProfileShape(params: ProductParams): THREE.Shape {
  const { productType, height, thickness, width, profileStyle, customProfileSvg } = params;
  const h = height / 1000;
  const t = thickness / 1000;

  if (productType === 'riflaj') {
    const w = (width ?? 120) / 1000;
    return buildRiflajShape(w, t, params.riflajType ?? 'RM');
  }

  if (productType === 'pardoseala_spc') {
    const w = (width ?? 180) / 1000;
    const traced = customProfileSvg ? buildShapeFromSVG(customProfileSvg, w, t) : null;
    if (traced) return traced;

    // SPC panel - bevel the top edges slightly for realism
    const shape = new THREE.Shape();
    const bevel = t * 0.08;
    shape.moveTo(bevel, 0);
    shape.lineTo(w - bevel, 0);
    shape.lineTo(w, bevel);
    shape.lineTo(w, t - bevel);
    shape.lineTo(w - bevel, t);
    shape.lineTo(bevel, t);
    shape.lineTo(0, t - bevel);
    shape.lineTo(0, bevel);
    shape.closePath();
    return shape;
  }

  const traced = customProfileSvg ? buildShapeFromSVG(customProfileSvg, t, h) : null;
  return traced ?? (productType === 'cornisa' ? buildCornisaShape(h, t, profileStyle) : buildPlintaShape(h, t, profileStyle));
}

function createProductGeometry(params: ProductParams): THREE.BufferGeometry {
  const shape = getProfileShape(params);
  const l = params.length / 1000;
  // Shape already spans width/thickness along X and height/thickness along Y (extrude depth =
  // length along Z), so the piece lies in its natural orientation — no rotation needed.
  return new THREE.ExtrudeGeometry(shape, { depth: l, bevelEnabled: false, steps: 1 });
}

// ─── Riflaj Profile Builders ──────────────────────────────────────────────────

interface RibCapInfo { cx: number; topWidth: number; }

function getRiflajParams(type: string, w: number): { n: number; ribFrac: number; ribHFrac: number; notchFrac: number } {
  switch (type) {
    case 'RM-XL': return { n: Math.max(2, Math.round(w / 0.025)), ribFrac: 0.58, ribHFrac: 0.62, notchFrac: 0.28 };
    case 'RS':    return { n: Math.max(2, Math.round(w / 0.022)), ribFrac: 0.62, ribHFrac: 0.65, notchFrac: 0.18 };
    case 'RX':    return { n: Math.max(2, Math.round(w / 0.030)), ribFrac: 0.60, ribHFrac: 0.60, notchFrac: 0.22 };
    default:      return { n: Math.max(3, Math.round(w / 0.018)), ribFrac: 0.56, ribHFrac: 0.62, notchFrac: 0.28 };
  }
}

// Builds the riflaj cross-section (viewed from end, X=width, Y=thickness) traced CCW.
// The rib pattern repeats across the width; channels have small semicircular notches.
function buildRiflajShape(w: number, t: number, riflajType: string): THREE.Shape {
  const shape = new THREE.Shape();
  const { n, ribFrac, ribHFrac, notchFrac } = getRiflajParams(riflajType, w);

  const pitch   = w / n;
  const ribW    = pitch * ribFrac;
  const chanW   = pitch - ribW;
  const halfChan = chanW / 2;
  const ribH    = t * ribHFrac;
  const chanBase = t - ribH;
  const notchR  = Math.min(chanW * notchFrac, chanW * 0.38);

  // CCW outline: bottom (l→r), right side up, top profile (r→l), left side down
  shape.moveTo(0, 0);
  shape.lineTo(w, 0);
  shape.lineTo(w, chanBase);

  for (let i = n - 1; i >= 0; i--) {
    const ribLeft  = halfChan + i * pitch;
    const ribRight = ribLeft + ribW;

    // Navigate from current x to ribRight at chanBase (channel or half-channel)
    if (i === n - 1) {
      shape.lineTo(ribRight, chanBase);  // right half-channel
    } else {
      // Full channel with notch dipping below chanBase
      const chanCX = ribRight + chanW / 2;
      if (notchR > 0.0005 && notchR < chanW * 0.44) {
        shape.lineTo(chanCX + notchR, chanBase);
        shape.absarc(chanCX, chanBase, notchR, 0, Math.PI, false); // CW arc dips down
        shape.lineTo(ribRight, chanBase);
      } else {
        shape.lineTo(ribRight, chanBase);
      }
    }

    // Rib from (ribRight, chanBase) up and across to (ribLeft, chanBase)
    if (riflajType === 'RS') {
      // Trapezoidal: sloped sides, narrower top
      const slope = ribW * 0.18;
      shape.lineTo(ribRight - slope, t);
      shape.lineTo(ribLeft  + slope, t);
      shape.lineTo(ribLeft, chanBase);
    } else if (riflajType === 'RX') {
      // Stepped: two-level staircase rib
      const sw  = ribW * 0.22;
      const midH = chanBase + ribH * 0.45;
      shape.lineTo(ribRight, midH);
      shape.lineTo(ribRight - sw, midH);
      shape.lineTo(ribRight - sw, t);
      shape.lineTo(ribLeft  + sw, t);
      shape.lineTo(ribLeft  + sw, midH);
      shape.lineTo(ribLeft,       midH);
      shape.lineTo(ribLeft,       chanBase);
    } else {
      // RM / RM-XL: rectangular rib
      shape.lineTo(ribRight, t);
      shape.lineTo(ribLeft,  t);
      shape.lineTo(ribLeft,  chanBase);
    }
    // After tracing rib we're at (ribLeft, chanBase) — next iter picks up from here
  }

  shape.lineTo(0, chanBase);  // left half-channel
  shape.lineTo(0, 0);
  shape.closePath();
  return shape;
}

// Returns the center-x and top-face width of each rib, used to build secondary-color cap meshes.
function getRiflajRibCaps(w: number, riflajType: string): RibCapInfo[] {
  const { n, ribFrac } = getRiflajParams(riflajType, w);
  const pitch  = w / n;
  const ribW   = pitch * ribFrac;
  const halfChan = (pitch - ribW) / 2;
  const caps: RibCapInfo[] = [];
  for (let i = 0; i < n; i++) {
    const ribLeft = halfChan + i * pitch;
    let topWidth = ribW;
    if (riflajType === 'RS') topWidth = ribW * (1 - 2 * 0.18);
    else if (riflajType === 'RX') topWidth = ribW * (1 - 2 * 0.22);
    caps.push({ cx: ribLeft + ribW / 2, topWidth: Math.max(topWidth, 0.001) });
  }
  return caps;
}

// ExtrudeGeometry's default WorldUVGenerator maps UVs straight from local geometry coordinates,
// which are already in meters (see the /1000 conversions above) — there's no normalized 0-1 step.
// So a single repeat factor, expressed as "1 over the real-world size one texture tile should
// cover", tiles consistently across both the end caps and the long side faces with no per-axis
// special-casing. 0.15m (15cm) matches a typical close-up wood/grain photo's apparent coverage.
const TEXTURE_TILE_SIZE_M = 0.15;

function loadProductTexture(dataUrl: string, onLoad: (tex: THREE.Texture) => void): void {
  new THREE.TextureLoader().load(dataUrl, (tex) => {
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.colorSpace = THREE.SRGBColorSpace;
    const repeat = 1 / TEXTURE_TILE_SIZE_M;
    tex.repeat.set(repeat, repeat);
    onLoad(tex);
  });
}

// ─── OBJ Exporter ─────────────────────────────────────────────────────────────

function exportToOBJ(mesh: THREE.Mesh, productName: string, color: string, textureDataUrl?: string, miterPlane?: THREE.Plane | null): void {
  const base = mesh.geometry.clone();
  const geo = miterPlane ? clipGeometryByPlane(base, miterPlane) : base;
  geo.computeVertexNormals();

  const positions = geo.attributes.position;
  const normals = geo.attributes.normal;
  const uvs = geo.attributes.uv;
  const index = geo.index;
  const repeat = 1 / TEXTURE_TILE_SIZE_M; // matches the live viewer's tiling — see loadProductTexture

  let obj = `# Wood Class CAD Export\n# ${productName}\n\nmtllib ${productName}.mtl\nusemtl material\n\n`;

  for (let i = 0; i < positions.count; i++) {
    obj += `v ${positions.getX(i).toFixed(6)} ${positions.getY(i).toFixed(6)} ${positions.getZ(i).toFixed(6)}\n`;
  }
  obj += '\n';
  if (textureDataUrl) {
    for (let i = 0; i < uvs.count; i++) {
      obj += `vt ${(uvs.getX(i) * repeat).toFixed(6)} ${(uvs.getY(i) * repeat).toFixed(6)}\n`;
    }
    obj += '\n';
  }
  for (let i = 0; i < normals.count; i++) {
    obj += `vn ${normals.getX(i).toFixed(6)} ${normals.getY(i).toFixed(6)} ${normals.getZ(i).toFixed(6)}\n`;
  }
  obj += '\ng mesh\n';

  const face = (a: number, b: number, c: number) =>
    textureDataUrl ? `f ${a}/${a}/${a} ${b}/${b}/${b} ${c}/${c}/${c}\n` : `f ${a}//${a} ${b}//${b} ${c}//${c}\n`;

  if (index) {
    for (let i = 0; i < index.count; i += 3) {
      obj += face(index.getX(i) + 1, index.getX(i + 1) + 1, index.getX(i + 2) + 1);
    }
  } else {
    for (let i = 0; i < positions.count; i += 3) {
      obj += face(i + 1, i + 2, i + 3);
    }
  }

  const r = parseInt(color.slice(1, 3), 16) / 255;
  const g = parseInt(color.slice(3, 5), 16) / 255;
  const b = parseInt(color.slice(5, 7), 16) / 255;
  // White Kd when textured — the diffuse map should carry the real color, not be tinted by the hex swatch.
  const kd = textureDataUrl ? '1.0000 1.0000 1.0000' : `${r.toFixed(4)} ${g.toFixed(4)} ${b.toFixed(4)}`;
  const mapLine = textureDataUrl ? `map_Kd ${productName}.jpg\n` : '';
  const mtl = `# Wood Class Material\nnewmtl material\nKa ${r.toFixed(4)} ${g.toFixed(4)} ${b.toFixed(4)}\nKd ${kd}\nKs 0.1 0.1 0.1\nNs 30\nd 1.0\n${mapLine}`;

  downloadFile(`${productName}.obj`, obj, 'text/plain');
  downloadFile(`${productName}.mtl`, mtl, 'text/plain');
  if (textureDataUrl) {
    downloadFile(`${productName}.jpg`, dataUrlToBlob(textureDataUrl), 'image/jpeg');
  }
}

// ─── STL Exporter ─────────────────────────────────────────────────────────────

function exportToSTL(mesh: THREE.Mesh, productName: string, miterPlane?: THREE.Plane | null): void {
  const base = mesh.geometry.clone();
  const geo = miterPlane ? clipGeometryByPlane(base, miterPlane) : base;
  geo.computeVertexNormals();

  const positions = geo.attributes.position;
  const normals = geo.attributes.normal;
  const index = geo.index;

  const triCount = index ? index.count / 3 : positions.count / 3;
  const buffer = new ArrayBuffer(84 + triCount * 50);
  const view = new DataView(buffer);

  // 80-byte header
  const header = `Wood Class CAD - ${productName}`;
  for (let i = 0; i < 80; i++) {
    view.setUint8(i, i < header.length ? header.charCodeAt(i) : 0);
  }
  view.setUint32(80, triCount, true);

  let offset = 84;
  const writeTri = (ai: number, bi: number, ci: number) => {
    const nx = (normals.getX(ai) + normals.getX(bi) + normals.getX(ci)) / 3;
    const ny = (normals.getY(ai) + normals.getY(bi) + normals.getY(ci)) / 3;
    const nz = (normals.getZ(ai) + normals.getZ(bi) + normals.getZ(ci)) / 3;
    view.setFloat32(offset, nx, true); offset += 4;
    view.setFloat32(offset, ny, true); offset += 4;
    view.setFloat32(offset, nz, true); offset += 4;
    for (const idx of [ai, bi, ci]) {
      view.setFloat32(offset, positions.getX(idx), true); offset += 4;
      view.setFloat32(offset, positions.getY(idx), true); offset += 4;
      view.setFloat32(offset, positions.getZ(idx), true); offset += 4;
    }
    view.setUint16(offset, 0, true); offset += 2;
  };

  if (index) {
    for (let i = 0; i < index.count; i += 3) {
      writeTri(index.getX(i), index.getX(i + 1), index.getX(i + 2));
    }
  } else {
    for (let i = 0; i < positions.count; i += 3) {
      writeTri(i, i + 1, i + 2);
    }
  }

  downloadFile(`${productName}.stl`, new Blob([buffer]), 'application/octet-stream');
}

// ─── DAE (Collada) Exporter ───────────────────────────────────────────────────

function exportToDAE(mesh: THREE.Mesh, productName: string, color: string, textureDataUrl?: string, miterPlane?: THREE.Plane | null): void {
  const base = mesh.geometry.clone();
  const geo = miterPlane ? clipGeometryByPlane(base, miterPlane) : base;
  geo.computeVertexNormals();

  const positions = geo.attributes.position;
  const normals = geo.attributes.normal;
  const uvs = geo.attributes.uv;
  const index = geo.index;
  const repeat = 1 / TEXTURE_TILE_SIZE_M; // matches the live viewer's tiling — see loadProductTexture

  const posArr: number[] = [];
  const nrmArr: number[] = [];
  const uvArr: number[] = [];
  const triArr: string[] = [];

  for (let i = 0; i < positions.count; i++) {
    posArr.push(positions.getX(i), positions.getY(i), positions.getZ(i));
    nrmArr.push(normals.getX(i), normals.getY(i), normals.getZ(i));
    if (textureDataUrl) uvArr.push(uvs.getX(i) * repeat, uvs.getY(i) * repeat);
  }

  const pushTri = (a: number, b: number, c: number) =>
    triArr.push(textureDataUrl
      ? `${a} ${a} ${a} ${b} ${b} ${b} ${c} ${c} ${c}`
      : `${a} ${a} ${b} ${b} ${c} ${c}`);

  const triCount = index ? index.count / 3 : positions.count / 3;
  if (index) {
    for (let i = 0; i < index.count; i += 3) {
      pushTri(index.getX(i), index.getX(i + 1), index.getX(i + 2));
    }
  } else {
    for (let i = 0; i < positions.count; i += 3) {
      pushTri(i, i + 1, i + 2);
    }
  }

  const r = parseInt(color.slice(1, 3), 16) / 255;
  const g = parseInt(color.slice(3, 5), 16) / 255;
  const b = parseInt(color.slice(5, 7), 16) / 255;

  // External sibling image file (same pattern as OBJ+MTL+jpg) — broader-compatibility bet than
  // an inline base64 data URI, since not every COLLADA importer (incl. SketchUp) supports that.
  const imageLib = textureDataUrl ? `
  <library_images>
    <image id="tex-img" name="tex-img">
      <init_from>${productName}.jpg</init_from>
    </image>
  </library_images>` : '';

  const samplerParams = textureDataUrl ? `
          <newparam sid="tex-surface">
            <surface type="2D"><init_from>tex-img</init_from></surface>
          </newparam>
          <newparam sid="tex-sampler">
            <sampler2D><source>tex-surface</source></sampler2D>
          </newparam>` : '';

  const diffuse = textureDataUrl
    ? `<texture texture="tex-sampler" texcoord="UVSET0"/>`
    : `<color>${r.toFixed(4)} ${g.toFixed(4)} ${b.toFixed(4)} 1</color>`;

  const uvSource = textureDataUrl ? `
        <source id="uv">
          <float_array id="uv-arr" count="${uvArr.length}">${uvArr.map(v => v.toFixed(6)).join(' ')}</float_array>
          <technique_common>
            <accessor source="#uv-arr" count="${uvArr.length / 2}" stride="2">
              <param name="S" type="float"/><param name="T" type="float"/>
            </accessor>
          </technique_common>
        </source>` : '';

  const uvInput = textureDataUrl ? `
          <input semantic="TEXCOORD" source="#uv" offset="2" set="0"/>` : '';

  const now = new Date().toISOString();
  const dae = `<?xml version="1.0" encoding="utf-8"?>
<COLLADA xmlns="http://www.collada.org/2005/11/COLLADASchema" version="1.4.1">
  <asset>
    <created>${now}</created>
    <modified>${now}</modified>
    <unit name="meter" meter="1"/>
    <up_axis>Y_UP</up_axis>
  </asset>${imageLib}
  <library_effects>
    <effect id="mat-fx">
      <profile_COMMON>${samplerParams}
        <technique sid="common">
          <phong>
            <diffuse>${diffuse}</diffuse>
            <specular><color>0.1 0.1 0.1 1</color></specular>
            <shininess><float>30</float></shininess>
          </phong>
        </technique>
      </profile_COMMON>
    </effect>
  </library_effects>
  <library_materials>
    <material id="mat" name="${productName}-material">
      <instance_effect url="#mat-fx"/>
    </material>
  </library_materials>
  <library_geometries>
    <geometry id="mesh-geom" name="${productName}">
      <mesh>
        <source id="pos">
          <float_array id="pos-arr" count="${posArr.length}">${posArr.map(v => v.toFixed(6)).join(' ')}</float_array>
          <technique_common>
            <accessor source="#pos-arr" count="${posArr.length / 3}" stride="3">
              <param name="X" type="float"/><param name="Y" type="float"/><param name="Z" type="float"/>
            </accessor>
          </technique_common>
        </source>
        <source id="nrm">
          <float_array id="nrm-arr" count="${nrmArr.length}">${nrmArr.map(v => v.toFixed(6)).join(' ')}</float_array>
          <technique_common>
            <accessor source="#nrm-arr" count="${nrmArr.length / 3}" stride="3">
              <param name="X" type="float"/><param name="Y" type="float"/><param name="Z" type="float"/>
            </accessor>
          </technique_common>
        </source>${uvSource}
        <vertices id="verts">
          <input semantic="POSITION" source="#pos"/>
        </vertices>
        <triangles count="${triCount}" material="mat">
          <input semantic="VERTEX" source="#verts" offset="0"/>
          <input semantic="NORMAL" source="#nrm" offset="1"/>${uvInput}
          <p>${triArr.join(' ')}</p>
        </triangles>
      </mesh>
    </geometry>
  </library_geometries>
  <library_visual_scenes>
    <visual_scene id="scene" name="Scene">
      <node id="Mesh" name="${productName}" type="NODE">
        <instance_geometry url="#mesh-geom">
          <bind_material>
            <technique_common>
              <instance_material symbol="mat" target="#mat">${textureDataUrl ? `
                <bind_vertex_input semantic="UVSET0" input_semantic="TEXCOORD" input_set="0"/>` : ''}
              </instance_material>
            </technique_common>
          </bind_material>
        </instance_geometry>
      </node>
    </visual_scene>
  </library_visual_scenes>
  <scene><instance_visual_scene url="#scene"/></scene>
</COLLADA>`;

  downloadFile(`${productName}.dae`, dae, 'model/vnd.collada+xml');
  if (textureDataUrl) {
    downloadFile(`${productName}.jpg`, dataUrlToBlob(textureDataUrl), 'image/jpeg');
  }
}

// ─── DXF (2D CAD sketch) Exporter ─────────────────────────────────────────────

function exportToDXF(shape: THREE.Shape, productName: string): void {
  // Profile coordinates are in meters (extrusion convention); DXF sketches use mm.
  const pts = shape.getPoints(128).map(p => ({ x: p.x * 1000, y: p.y * 1000 }));

  const lines: string[] = [
    '0', 'SECTION', '2', 'HEADER',
    '9', '$ACADVER', '1', 'AC1009',
    '9', '$INSUNITS', '70', '4', // 4 = millimeters
    '0', 'ENDSEC',
    '0', 'SECTION', '2', 'ENTITIES',
    '0', 'POLYLINE',
    '8', 'PROFIL',
    '66', '1',
    '70', '1', // closed polyline
  ];

  for (const p of pts) {
    lines.push('0', 'VERTEX', '8', 'PROFIL', '10', p.x.toFixed(3), '20', p.y.toFixed(3), '30', '0.0');
  }

  lines.push('0', 'SEQEND', '0', 'ENDSEC', '0', 'EOF');

  downloadFile(`${productName}_schita_profil.dxf`, lines.join('\n') + '\n', 'application/dxf');
}

// ─── Download helper ──────────────────────────────────────────────────────────

function downloadFile(filename: string, content: string | Blob, type: string): void {
  const blob = content instanceof Blob ? content : new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function dataUrlToBlob(dataUrl: string): Blob {
  const [header, base64] = dataUrl.split(',');
  const mime = header.match(/data:(.*?);base64/)?.[1] ?? 'image/jpeg';
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

function productLabel(params: ProductParams): string {
  const miterSuffixes: Record<string, string> = { interior: '_45int', interior_left: '_45int_inv', exterior: '_45ext', exterior_left: '_45ext_inv' };
  const miterSuffix = params.miterType ? (miterSuffixes[params.miterType] ?? '') : '';
  if (params.productType === 'riflaj') {
    return `Riflaj_${params.riflajType ?? 'RM'}_${params.width ?? 120}x${params.thickness}x${params.length}mm${miterSuffix}`;
  }
  const typeMap: Record<string, string> = {
    plinta: 'Plinta',
    cornisa: 'Cornisa',
    pardoseala_spc: 'Pardoseala_SPC',
    unknown: 'Produs',
  };
  return `${typeMap[params.productType] ?? 'Produs'}_${params.height}x${params.thickness}x${params.length}mm${miterSuffix}`;
}

// ─── Miter Cut ────────────────────────────────────────────────────────────────

// Returns a Three.js clipping plane (in world space) for a 45° miter at the right end (+Z).
// After mesh centering, world coords: X ∈ [-xHalf, xHalf], Z ∈ [-l/2, l/2].
// Interior: back face (X = -xHalf) stays at full length; front face (X = +xHalf) is shorter.
// Exterior: front face (X = +xHalf) stays at full length; back face is shorter.
function getMiterPlane(params: ProductParams): THREE.Plane | null {
  if (!params.miterType || params.miterType === 'none') return null;
  const l = params.length / 1000;
  const t = params.thickness / 1000;
  const w = params.width != null ? params.width / 1000 : t;
  const xHalf = (params.productType === 'pardoseala_spc' || params.productType === 'riflaj') ? w / 2 : t / 2;
  const constant = (l / 2 - xHalf) / Math.SQRT2;
  // Right-end cuts (+Z face): interior keeps back longer, exterior keeps front longer.
  // Left-end cuts (−Z face): mirror of the above — normal Z component flips to +1.
  const normals: Record<string, [number, number, number]> = {
    interior:       [-1, 0, -1],
    exterior:       [ 1, 0, -1],
    interior_left:  [ 1, 0,  1],
    exterior_left:  [-1, 0,  1],
  };
  const n = normals[params.miterType];
  if (!n) return null;
  return new THREE.Plane(new THREE.Vector3(...n).normalize(), constant);
}

type Vec3Tuple = [number, number, number];
function lerpV(a: Vec3Tuple, b: Vec3Tuple, t: number): Vec3Tuple {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

// Clips a BufferGeometry against a Three.js Plane (world-space). Returns a new non-indexed geometry
// with triangles that cross the plane split at the intersection edge. No cap face is added (the
// cut face is open); downstream 3D apps can close it if needed.
function clipGeometryByPlane(geo: THREE.BufferGeometry, plane: THREE.Plane): THREE.BufferGeometry {
  const src = geo.index ? geo.toNonIndexed() : geo.clone();
  const pos = src.attributes.position;
  const nrm = src.attributes.normal;
  const uv  = src.attributes.uv;

  const outPos: number[] = [], outNrm: number[] = [], outUV: number[] = [];

  const n = plane.normal;
  const d0 = (v: Vec3Tuple) => n.x * v[0] + n.y * v[1] + n.z * v[2] + plane.constant;

  for (let tri = 0; tri < pos.count / 3; tri++) {
    const verts: Vec3Tuple[] = [], nrms: Vec3Tuple[] = [], uvs: [number, number][] = [];
    for (let j = 0; j < 3; j++) {
      const i = tri * 3 + j;
      verts.push([pos.getX(i), pos.getY(i), pos.getZ(i)]);
      nrms.push([nrm.getX(i), nrm.getY(i), nrm.getZ(i)]);
      if (uv) uvs.push([uv.getX(i), uv.getY(i)]);
    }
    const ds = verts.map(d0);
    const inside = ds.map(d => d >= 0);
    const cnt = inside.filter(Boolean).length;
    if (cnt === 3) {
      for (let j = 0; j < 3; j++) { outPos.push(...verts[j]); outNrm.push(...nrms[j]); if (uv) outUV.push(...uvs[j]); }
    } else if (cnt === 0) {
      // fully clipped — skip
    } else {
      let idx = [0, 1, 2];
      while (!inside[idx[0]]) idx = [idx[1], idx[2], idx[0]];
      const [i0, i1, i2] = idx;
      const v = [verts[i0], verts[i1], verts[i2]];
      const nn = [nrms[i0], nrms[i1], nrms[i2]];
      const du = uv ? [uvs[i0], uvs[i1], uvs[i2]] : [];
      const dd = [ds[i0], ds[i1], ds[i2]];

      if (cnt === 1) {
        const t01 = dd[0] / (dd[0] - dd[1]), t02 = dd[0] / (dd[0] - dd[2]);
        const p01 = lerpV(v[0], v[1], t01), p02 = lerpV(v[0], v[2], t02);
        outPos.push(...v[0], ...p01, ...p02);
        outNrm.push(...nn[0], ...lerpV(nn[0], nn[1], t01), ...lerpV(nn[0], nn[2], t02));
        if (uv) { outUV.push(...du[0], du[0][0]+(du[1][0]-du[0][0])*t01, du[0][1]+(du[1][1]-du[0][1])*t01, du[0][0]+(du[2][0]-du[0][0])*t02, du[0][1]+(du[2][1]-du[0][1])*t02); }
      } else {
        const t02 = dd[0] / (dd[0] - dd[2]), t12 = dd[1] / (dd[1] - dd[2]);
        const p02 = lerpV(v[0], v[2], t02), p12 = lerpV(v[1], v[2], t12);
        const n02 = lerpV(nn[0], nn[2], t02), n12 = lerpV(nn[1], nn[2], t12);
        outPos.push(...v[0], ...v[1], ...p02, ...v[1], ...p12, ...p02);
        outNrm.push(...nn[0], ...nn[1], ...n02, ...nn[1], ...n12, ...n02);
        if (uv) {
          const uv02: [number, number] = [du[0][0]+(du[2][0]-du[0][0])*t02, du[0][1]+(du[2][1]-du[0][1])*t02];
          const uv12: [number, number] = [du[1][0]+(du[2][0]-du[1][0])*t12, du[1][1]+(du[2][1]-du[1][1])*t12];
          outUV.push(...du[0], ...du[1], ...uv02, ...du[1], ...uv12, ...uv02);
        }
      }
    }
  }

  const result = new THREE.BufferGeometry();
  result.setAttribute('position', new THREE.Float32BufferAttribute(outPos, 3));
  result.setAttribute('normal', new THREE.Float32BufferAttribute(outNrm, 3));
  if (uv) result.setAttribute('uv', new THREE.Float32BufferAttribute(outUV, 2));
  return result;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function ThreeViewer({ params }: Props) {
  const mountRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const meshRef = useRef<THREE.Mesh | null>(null);
  const animFrameRef = useRef<number>(0);

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    // Scene
    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#1a1a2e');
    sceneRef.current = scene;

    // Grid
    const grid = new THREE.GridHelper(10, 40, '#2a2a4a', '#222238');
    grid.position.y = -0.001;
    scene.add(grid);

    // Lights
    const ambient = new THREE.AmbientLight(0xffffff, 0.5);
    scene.add(ambient);
    const key = new THREE.DirectionalLight(0xfff8f0, 1.2);
    key.position.set(5, 10, 5);
    key.castShadow = true;
    scene.add(key);
    const fill = new THREE.DirectionalLight(0xd0e8ff, 0.4);
    fill.position.set(-5, 3, -5);
    scene.add(fill);
    const rim = new THREE.DirectionalLight(0xffffff, 0.2);
    rim.position.set(0, -5, -10);
    scene.add(rim);

    // Camera
    const camera = new THREE.PerspectiveCamera(45, container.clientWidth / container.clientHeight, 0.001, 1000);
    camera.position.set(2, 0.5, 1.5);
    cameraRef.current = camera;

    // Renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.1;
    renderer.localClippingEnabled = true;
    container.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // Controls
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.minDistance = 0.05;
    controls.maxDistance = 20;
    controlsRef.current = controls;

    // Animate
    const animate = () => {
      animFrameRef.current = requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
    };
    animate();

    // Resize
    const observer = new ResizeObserver(() => {
      if (!container) return;
      camera.aspect = container.clientWidth / container.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(container.clientWidth, container.clientHeight);
    });
    observer.observe(container);

    return () => {
      cancelAnimationFrame(animFrameRef.current);
      observer.disconnect();
      controls.dispose();
      renderer.dispose();
      container.removeChild(renderer.domElement);
    };
  }, []);

  // Update mesh when params change
  useEffect(() => {
    const scene = sceneRef.current;
    const camera = cameraRef.current;
    if (!scene || !camera) return;

    // Remove old mesh and any rib-cap children — traverse disposes all geometries/materials
    // (including secondary-color rib caps) and avoids GPU leaks from textures and shared mats.
    if (meshRef.current) {
      scene.remove(meshRef.current);
      const disposed = new Set<THREE.Material>();
      meshRef.current.traverse((obj) => {
        if (!(obj instanceof THREE.Mesh)) return;
        obj.geometry.dispose();
        const m = obj.material as THREE.MeshStandardMaterial;
        if (!disposed.has(m)) { m.map?.dispose(); m.dispose(); disposed.add(m); }
      });
      meshRef.current = null;
    }

    if (!params) return;

    const geo = createProductGeometry(params);
    geo.computeVertexNormals();

    // White base color when a texture is present — tinting an uploaded real photo by the hex
    // `color` field would distort it instead of just providing a solid-color fallback.
    const mat = new THREE.MeshStandardMaterial({
      color: params.textureDataUrl ? '#ffffff' : new THREE.Color(params.color),
      roughness: 0.65,
      metalness: 0.05,
    });

    const miterPlane = getMiterPlane(params);
    mat.clippingPlanes = miterPlane ? [miterPlane] : [];

    const mesh = new THREE.Mesh(geo, mat);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    scene.add(mesh);
    meshRef.current = mesh;

    // Riflaj secondary-color (or secondary-texture) rib caps: thin boxes placed at each rib top.
    // Added as children of the main mesh so they follow the centering translation automatically.
    // Texture (secondaryTextureDataUrl) overrides solid color when present — same pattern as main mesh.
    if (params.productType === 'riflaj' && (params.secondaryColor || params.secondaryTextureDataUrl)) {
      const w = (params.width ?? 120) / 1000;
      const t = params.thickness / 1000;
      const l = params.length / 1000;
      const capH = 0.001;
      const capMat = new THREE.MeshStandardMaterial({
        color: params.secondaryTextureDataUrl ? '#ffffff' : new THREE.Color(params.secondaryColor ?? '#8B6914'),
        roughness: 0.60,
        metalness: 0.05,
        clippingPlanes: miterPlane ? [miterPlane] : [],
      });
      for (const cap of getRiflajRibCaps(w, params.riflajType ?? 'RM')) {
        const capGeo = new THREE.BoxGeometry(cap.topWidth, capH, l);
        const capMesh = new THREE.Mesh(capGeo, capMat);
        capMesh.position.set(cap.cx, t + capH / 2, l / 2);
        mesh.add(capMesh);
      }
      if (params.secondaryTextureDataUrl) {
        loadProductTexture(params.secondaryTextureDataUrl, (tex) => {
          if (cancelled) { tex.dispose(); return; }
          capMat.map = tex;
          capMat.needsUpdate = true;
        });
      }
    }

    let cancelled = false;
    if (params.textureDataUrl) {
      loadProductTexture(params.textureDataUrl, (tex) => {
        if (cancelled) { tex.dispose(); return; }
        mat.map = tex;
        mat.needsUpdate = true;
      });
    }

    // Fit camera to model — these products are long and thin (length >> height/thickness),
    // so a fixed-ratio camera offset puts most of the distance budget along the long axis
    // and the piece renders as a tiny foreshortened sliver. Instead, project the bounding
    // box corners onto a fixed viewing direction and solve the distance that snugly fits
    // both screen axes, accounting for the real aspect ratio.
    const box = new THREE.Box3().setFromObject(mesh);
    const center = box.getCenter(new THREE.Vector3());
    mesh.position.sub(center); // center the mesh at origin
    const halfSize = box.getSize(new THREE.Vector3()).multiplyScalar(0.5);

    const dir = new THREE.Vector3(1, 0.5, 0.35).normalize(); // mostly side-on, slight reveal of the end profile
    const up = new THREE.Vector3(0, 1, 0);
    const forward = dir.clone().negate();
    const right = new THREE.Vector3().crossVectors(up, forward).normalize();
    const camUp = new THREE.Vector3().crossVectors(forward, right).normalize();

    let maxRight = 0;
    let maxUp = 0;
    for (const sx of [-1, 1]) {
      for (const sy of [-1, 1]) {
        for (const sz of [-1, 1]) {
          const corner = new THREE.Vector3(sx * halfSize.x, sy * halfSize.y, sz * halfSize.z);
          maxRight = Math.max(maxRight, Math.abs(corner.dot(right)));
          maxUp = Math.max(maxUp, Math.abs(corner.dot(camUp)));
        }
      }
    }

    const vFov = camera.fov * (Math.PI / 180);
    const hFov = 2 * Math.atan(Math.tan(vFov / 2) * camera.aspect);
    const dist = Math.max(maxUp / Math.tan(vFov / 2), maxRight / Math.tan(hFov / 2)) * 1.25;

    camera.position.copy(dir).multiplyScalar(dist);
    camera.near = Math.max(dist * 0.001, 0.0001);
    camera.far = dist * 10;
    camera.updateProjectionMatrix();

    controlsRef.current!.target.set(0, 0, 0);
    controlsRef.current!.update();

    return () => {
      cancelled = true;
    };
  }, [params]);

  const handleExportOBJ = useCallback(() => {
    if (!meshRef.current || !params) return;
    exportToOBJ(meshRef.current, productLabel(params), params.color, params.textureDataUrl, getMiterPlane(params));
  }, [params]);

  const handleExportSTL = useCallback(() => {
    if (!meshRef.current || !params) return;
    exportToSTL(meshRef.current, productLabel(params), getMiterPlane(params));
  }, [params]);

  const handleExportDAE = useCallback(() => {
    if (!meshRef.current || !params) return;
    exportToDAE(meshRef.current, productLabel(params), params.color, params.textureDataUrl, getMiterPlane(params));
  }, [params]);

  const handleExportDXF = useCallback(() => {
    if (!params) return;
    exportToDXF(getProfileShape(params), productLabel(params));
  }, [params]);

  const handleExportJPG = useCallback(() => {
    const renderer = rendererRef.current;
    const scene = sceneRef.current;
    const camera = cameraRef.current;
    if (!renderer || !scene || !camera || !params) return;
    renderer.render(scene, camera);
    const dataUrl = renderer.domElement.toDataURL('image/jpeg', 0.95);
    downloadFile(`${productLabel(params)}_preview.jpg`, dataUrlToBlob(dataUrl), 'image/jpeg');
  }, [params]);

  return (
    <div className="flex flex-col h-full gap-3">
      <div
        ref={mountRef}
        className="flex-1 rounded-xl overflow-hidden border border-white/10 min-h-[300px]"
        style={{ background: '#1a1a2e' }}
      />

      {params && (
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={handleExportOBJ}
            className="flex-1 min-w-[120px] px-4 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium transition-colors"
          >
            Export OBJ + MTL
          </button>
          <button
            onClick={handleExportDAE}
            className="flex-1 min-w-[120px] px-4 py-2.5 rounded-lg bg-violet-600 hover:bg-violet-500 text-white text-sm font-medium transition-colors"
          >
            Export DAE (SketchUp)
          </button>
          <button
            onClick={handleExportSTL}
            className="flex-1 min-w-[120px] px-4 py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-medium transition-colors"
          >
            Export STL
          </button>
          <button
            onClick={handleExportDXF}
            className="flex-1 min-w-[120px] px-4 py-2.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white text-sm font-medium transition-colors"
          >
            Export schiță CAD (DXF)
          </button>
          <button
            onClick={handleExportJPG}
            className="flex-1 min-w-[120px] px-4 py-2.5 rounded-lg bg-amber-600 hover:bg-amber-500 text-white text-sm font-medium transition-colors"
          >
            Export JPG (preview 3D)
          </button>
        </div>
      )}

      {params && (
        <div className="bg-white/5 rounded-lg p-3 text-xs text-slate-300 space-y-1">
          <div className="font-semibold text-slate-200 mb-2">Parametri extrași</div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1">
            <span className="text-slate-400">Tip:</span>
            <span>
              {params.productType === 'riflaj'
                ? `RIFLAJ ${params.riflajType ?? 'RM'}`
                : params.productType.replace('_', ' ').toUpperCase()}
            </span>
            {params.productType !== 'pardoseala_spc' && params.productType !== 'riflaj' && (
              <>
                <span className="text-slate-400">Înălțime:</span>
                <span>{params.height} mm</span>
              </>
            )}
            <span className="text-slate-400">Grosime:</span>
            <span>{params.thickness} mm</span>
            {(params.productType === 'pardoseala_spc' || params.productType === 'riflaj') && params.width && (
              <>
                <span className="text-slate-400">Lățime:</span>
                <span>{params.width} mm</span>
              </>
            )}
            <span className="text-slate-400">Lungime:</span>
            <span>{params.length} mm</span>
            {params.productType !== 'riflaj' && (
              <>
                <span className="text-slate-400">Profil:</span>
                <span>{params.customProfileSvg ? 'din schiță încărcată' : params.profileStyle}</span>
              </>
            )}
            <span className="text-slate-400">Finisaj:</span>
            <span>{params.finish}</span>
            <span className="text-slate-400">{params.textureDataUrl ? 'Textură:' : 'Culoare 1:'}</span>
            <span className="flex items-center gap-2">
              {params.textureDataUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={params.textureDataUrl} alt="" className="w-4 h-4 rounded object-cover border border-white/20" />
              ) : (
                <span className="inline-block w-4 h-4 rounded border border-white/20" style={{ background: params.color }} />
              )}
              {params.textureDataUrl ? 'încărcată de utilizator' : params.color}
            </span>
            {params.productType === 'riflaj' && (params.secondaryColor || params.secondaryTextureDataUrl) && (
              <>
                <span className="text-slate-400">{params.secondaryTextureDataUrl ? 'Folie decor:' : 'Culoare 2:'}</span>
                <span className="flex items-center gap-2">
                  {params.secondaryTextureDataUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={params.secondaryTextureDataUrl} alt="" className="w-4 h-4 rounded object-cover border border-white/20" />
                  ) : (
                    <span className="inline-block w-4 h-4 rounded border border-white/20" style={{ background: params.secondaryColor }} />
                  )}
                  {params.secondaryTextureDataUrl ? 'textură aplicată' : params.secondaryColor}
                </span>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
