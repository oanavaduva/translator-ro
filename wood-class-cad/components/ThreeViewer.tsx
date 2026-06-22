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

// ─── OBJ Exporter ─────────────────────────────────────────────────────────────

function exportToOBJ(mesh: THREE.Mesh, productName: string, color: string): void {
  const geo = mesh.geometry.clone();
  geo.computeVertexNormals();

  const positions = geo.attributes.position;
  const normals = geo.attributes.normal;
  const index = geo.index;

  let obj = `# Wood Class CAD Export\n# ${productName}\n\nmtllib ${productName}.mtl\nusemtl material\n\n`;

  for (let i = 0; i < positions.count; i++) {
    obj += `v ${positions.getX(i).toFixed(6)} ${positions.getY(i).toFixed(6)} ${positions.getZ(i).toFixed(6)}\n`;
  }
  obj += '\n';
  for (let i = 0; i < normals.count; i++) {
    obj += `vn ${normals.getX(i).toFixed(6)} ${normals.getY(i).toFixed(6)} ${normals.getZ(i).toFixed(6)}\n`;
  }
  obj += '\ng mesh\n';

  if (index) {
    for (let i = 0; i < index.count; i += 3) {
      const a = index.getX(i) + 1;
      const b = index.getX(i + 1) + 1;
      const c = index.getX(i + 2) + 1;
      obj += `f ${a}//${a} ${b}//${b} ${c}//${c}\n`;
    }
  } else {
    for (let i = 0; i < positions.count; i += 3) {
      const a = i + 1, b = i + 2, c = i + 3;
      obj += `f ${a}//${a} ${b}//${b} ${c}//${c}\n`;
    }
  }

  const r = parseInt(color.slice(1, 3), 16) / 255;
  const g = parseInt(color.slice(3, 5), 16) / 255;
  const b = parseInt(color.slice(5, 7), 16) / 255;
  const mtl = `# Wood Class Material\nnewmtl material\nKa ${r.toFixed(4)} ${g.toFixed(4)} ${b.toFixed(4)}\nKd ${r.toFixed(4)} ${g.toFixed(4)} ${b.toFixed(4)}\nKs 0.1 0.1 0.1\nNs 30\nd 1.0\n`;

  downloadFile(`${productName}.obj`, obj, 'text/plain');
  downloadFile(`${productName}.mtl`, mtl, 'text/plain');
}

// ─── STL Exporter ─────────────────────────────────────────────────────────────

function exportToSTL(mesh: THREE.Mesh, productName: string): void {
  const geo = mesh.geometry.clone();
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

function exportToDAE(mesh: THREE.Mesh, productName: string, color: string): void {
  const geo = mesh.geometry.clone();
  geo.computeVertexNormals();

  const positions = geo.attributes.position;
  const normals = geo.attributes.normal;
  const index = geo.index;

  const posArr: number[] = [];
  const nrmArr: number[] = [];
  const triArr: string[] = [];

  for (let i = 0; i < positions.count; i++) {
    posArr.push(positions.getX(i), positions.getY(i), positions.getZ(i));
    nrmArr.push(normals.getX(i), normals.getY(i), normals.getZ(i));
  }

  const triCount = index ? index.count / 3 : positions.count / 3;
  if (index) {
    for (let i = 0; i < index.count; i += 3) {
      const a = index.getX(i), b = index.getX(i + 1), c = index.getX(i + 2);
      triArr.push(`${a} ${a} ${b} ${b} ${c} ${c}`);
    }
  } else {
    for (let i = 0; i < positions.count; i += 3) {
      triArr.push(`${i} ${i} ${i + 1} ${i + 1} ${i + 2} ${i + 2}`);
    }
  }

  const r = parseInt(color.slice(1, 3), 16) / 255;
  const g = parseInt(color.slice(3, 5), 16) / 255;
  const b = parseInt(color.slice(5, 7), 16) / 255;

  const now = new Date().toISOString();
  const dae = `<?xml version="1.0" encoding="utf-8"?>
<COLLADA xmlns="http://www.collada.org/2005/11/COLLADASchema" version="1.4.1">
  <asset>
    <created>${now}</created>
    <modified>${now}</modified>
    <unit name="meter" meter="1"/>
    <up_axis>Y_UP</up_axis>
  </asset>
  <library_effects>
    <effect id="mat-fx">
      <profile_COMMON>
        <technique sid="common">
          <phong>
            <diffuse><color>${r.toFixed(4)} ${g.toFixed(4)} ${b.toFixed(4)} 1</color></diffuse>
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
        </source>
        <vertices id="verts">
          <input semantic="POSITION" source="#pos"/>
        </vertices>
        <triangles count="${triCount}" material="mat">
          <input semantic="VERTEX" source="#verts" offset="0"/>
          <input semantic="NORMAL" source="#nrm" offset="1"/>
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
              <instance_material symbol="mat" target="#mat"/>
            </technique_common>
          </bind_material>
        </instance_geometry>
      </node>
    </visual_scene>
  </library_visual_scenes>
  <scene><instance_visual_scene url="#scene"/></scene>
</COLLADA>`;

  downloadFile(`${productName}.dae`, dae, 'model/vnd.collada+xml');
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

function productLabel(params: ProductParams): string {
  const typeMap: Record<string, string> = {
    plinta: 'Plinta',
    cornisa: 'Cornisa',
    pardoseala_spc: 'Pardoseala_SPC',
    unknown: 'Produs',
  };
  return `${typeMap[params.productType] ?? 'Produs'}_${params.height}x${params.thickness}x${params.length}mm`;
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

    // Remove old mesh
    if (meshRef.current) {
      scene.remove(meshRef.current);
      meshRef.current.geometry.dispose();
      meshRef.current = null;
    }

    if (!params) return;

    const geo = createProductGeometry(params);
    geo.computeVertexNormals();

    const mat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(params.color),
      roughness: 0.65,
      metalness: 0.05,
    });

    const mesh = new THREE.Mesh(geo, mat);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    scene.add(mesh);
    meshRef.current = mesh;

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
  }, [params]);

  const handleExportOBJ = useCallback(() => {
    if (!meshRef.current || !params) return;
    exportToOBJ(meshRef.current, productLabel(params), params.color);
  }, [params]);

  const handleExportSTL = useCallback(() => {
    if (!meshRef.current || !params) return;
    exportToSTL(meshRef.current, productLabel(params));
  }, [params]);

  const handleExportDAE = useCallback(() => {
    if (!meshRef.current || !params) return;
    exportToDAE(meshRef.current, productLabel(params), params.color);
  }, [params]);

  const handleExportDXF = useCallback(() => {
    if (!params) return;
    exportToDXF(getProfileShape(params), productLabel(params));
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
        </div>
      )}

      {params && (
        <div className="bg-white/5 rounded-lg p-3 text-xs text-slate-300 space-y-1">
          <div className="font-semibold text-slate-200 mb-2">Parametri extrași</div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1">
            <span className="text-slate-400">Tip:</span>
            <span>{params.productType.replace('_', ' ').toUpperCase()}</span>
            <span className="text-slate-400">Înălțime:</span>
            <span>{params.height} mm</span>
            <span className="text-slate-400">Grosime:</span>
            <span>{params.thickness} mm</span>
            {params.width && (
              <>
                <span className="text-slate-400">Lățime:</span>
                <span>{params.width} mm</span>
              </>
            )}
            <span className="text-slate-400">Lungime:</span>
            <span>{params.length} mm</span>
            <span className="text-slate-400">Profil:</span>
            <span>{params.customProfileSvg ? 'din schiță încărcată' : params.profileStyle}</span>
            <span className="text-slate-400">Finisaj:</span>
            <span>{params.finish}</span>
            <span className="text-slate-400">Culoare:</span>
            <span className="flex items-center gap-2">
              <span
                className="inline-block w-4 h-4 rounded border border-white/20"
                style={{ background: params.color }}
              />
              {params.color}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
