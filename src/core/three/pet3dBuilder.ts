import * as THREE from 'three';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import {
  solvePet3DPose,
  type Pet3DInteractAction,
  type Pet3DRigPose
} from '../pet3dKinematics';
import type { PetActivityState, PetSpecies } from '../types';

let _cachedSoftwareGl: boolean | null = null;

export function detectSoftwareWebGL(): boolean {
  if (_cachedSoftwareGl !== null) return _cachedSoftwareGl;
  if (typeof document === 'undefined') return true;
  try {
    const probe = document.createElement('canvas');
    const gl = probe.getContext('webgl2') || probe.getContext('webgl');
    if (!gl) {
      _cachedSoftwareGl = true;
      return true;
    }
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
    const gpu = String(gl.getParameter(param) || '');
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    _cachedSoftwareGl = /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
    return _cachedSoftwareGl;
  } catch {
    _cachedSoftwareGl = true;
    return true;
  }
}

export interface PetRigHandles {
  root: THREE.Group;
  bodyGroup: THREE.Group;
  headPivot: THREE.Group;
  earL: THREE.Group;
  earR: THREE.Group;
  eyelidL: THREE.Mesh;
  eyelidR: THREE.Mesh;
  jawGroup: THREE.Group;
  tailPivot: THREE.Group;
  wingL?: THREE.Group;
  wingR?: THREE.Group;
  limbFL: THREE.Group;
  limbFR: THREE.Group;
  limbBL: THREE.Group;
  limbBR: THREE.Group;
  toyGroup?: THREE.Group;
  bowlGroup?: THREE.Group;
  moonLight?: THREE.PointLight;
  moonMat?: THREE.MeshStandardMaterial;
  lanternGroup?: THREE.Group;
  zzzSprites: THREE.Sprite[];
  burstSprites: THREE.Sprite[];
  interactables: THREE.Object3D[];
}

interface SpeciesPalette {
  primary: number;
  secondary: number;
  belly: number;
  earInner: number;
  nose: number;
  rugBase: string;
  rugAccent: string;
  eyeIris: number;
  toyPrimary: number;
  toyStripe: number;
}

const SPECIES_PALETTES: Record<PetSpecies, SpeciesPalette> = {
  fox: {
    primary: 0x2563eb,
    secondary: 0x1d4ed8,
    belly: 0xf1f5f9,
    earInner: 0x93c5fd,
    nose: 0x0f172a,
    rugBase: '#271e18',
    rugAccent: '#d97706',
    eyeIris: 0x0f172a,
    toyPrimary: 0xf59e0b,
    toyStripe: 0xffffff
  },
  owl: {
    primary: 0x0284c7,
    secondary: 0x0369a1,
    belly: 0xe0f2fe,
    earInner: 0x7dd3fc,
    nose: 0xf59e0b,
    rugBase: '#111a2e',
    rugAccent: '#38bdf8',
    eyeIris: 0xfbbf24,
    toyPrimary: 0x38bdf8,
    toyStripe: 0xfde047
  },
  cat: {
    primary: 0xec4899,
    secondary: 0xdb2777,
    belly: 0xfff1f2,
    earInner: 0xfbcfe8,
    nose: 0xfb7185,
    rugBase: '#2a1624',
    rugAccent: '#f472b6',
    eyeIris: 0x10b981,
    toyPrimary: 0xf43f5e,
    toyStripe: 0xfde047
  },
  panda: {
    primary: 0xf8fafc,
    secondary: 0x1e293b,
    belly: 0xf8fafc,
    earInner: 0x334155,
    nose: 0x0f172a,
    rugBase: '#12261e',
    rugAccent: '#34d399',
    eyeIris: 0x1e293b,
    toyPrimary: 0x10b981,
    toyStripe: 0xfef08a
  }
};

function createCanvasCoatTexture(baseColorHex: number, species: PetSpecies): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const col = new THREE.Color(baseColorHex);
    ctx.fillStyle = `#${col.getHexString()}`;
    ctx.fillRect(0, 0, 128, 128);
    // Subtle organic fur / feather micro-strokes
    for (let i = 0; i < 420; i++) {
      const x = (i * 53) % 128;
      const y = (i * 97) % 128;
      ctx.fillStyle = i % 2 === 0 ? 'rgba(255,255,255,0.06)' : 'rgba(15,23,42,0.08)';
      ctx.fillRect(x, y, species === 'owl' ? 3 : 2, species === 'owl' ? 5 : 3);
    }
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

function createPedestalTexture(species: PetSpecies): THREE.CanvasTexture {
  const pal = SPECIES_PALETTES[species];
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.fillStyle = pal.rugBase;
    ctx.fillRect(0, 0, 256, 256);

    // Concentric crafted rings & subtle weave
    ctx.strokeStyle = pal.rugAccent;
    ctx.globalAlpha = 0.25;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(128, 128, 108, 0, Math.PI * 2);
    ctx.stroke();

    ctx.globalAlpha = 0.14;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(128, 128, 82, 0, Math.PI * 2);
    ctx.stroke();

    // Subtle radial speckles/stars
    ctx.fillStyle = pal.rugAccent;
    ctx.globalAlpha = 0.35;
    for (let i = 0; i < 24; i++) {
      const a = (i / 24) * Math.PI * 2;
      const r = 95;
      ctx.beginPath();
      ctx.arc(128 + Math.cos(a) * r, 128 + Math.sin(a) * r, 2, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function createContactShadowTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const grad = ctx.createRadialGradient(64, 64, 8, 64, 64, 60);
    grad.addColorStop(0, 'rgba(0,0,0,0.55)');
    grad.addColorStop(0.55, 'rgba(0,0,0,0.22)');
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 128, 128);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function createEmojiGlyphTexture(text: string, color: string): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 96;
  canvas.height = 96;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.clearRect(0, 0, 96, 96);
    ctx.font = 'bold 54px "Plus Jakarta Sans", system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = 'rgba(0,0,0,0.45)';
    ctx.shadowBlur = 8;
    ctx.fillStyle = color;
    ctx.fillText(text, 48, 50);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function markInteractable(obj: THREE.Object3D, action: Pet3DInteractAction, list: THREE.Object3D[]): void {
  obj.traverse(child => {
    child.userData.interactAction = action;
    if ((child as THREE.Mesh).isMesh) {
      child.layers.enable(1);
    }
  });
  list.push(obj);
}

export interface BuildPet3DOptions {
  includeProps?: boolean;
  includePedestal?: boolean;
  shadowMapEnabled?: boolean;
}

export function buildPet3DSceneRig(
  species: PetSpecies,
  equippedAccessories: string[],
  options: BuildPet3DOptions = {}
): PetRigHandles {
  const { includeProps = true, includePedestal = true, shadowMapEnabled = true } = options;
  const pal = SPECIES_PALETTES[species];
  const root = new THREE.Group();
  const interactables: THREE.Object3D[] = [];

  const coatTex = createCanvasCoatTexture(pal.primary, species);
  const primaryMat = new THREE.MeshStandardMaterial({
    color: pal.primary,
    map: coatTex,
    roughness: 0.78,
    metalness: 0.04
  });
  const secondaryMat = new THREE.MeshStandardMaterial({
    color: pal.secondary,
    roughness: 0.8,
    metalness: 0.05
  });
  const bellyMat = new THREE.MeshStandardMaterial({
    color: pal.belly,
    roughness: 0.85,
    metalness: 0.02
  });
  const innerEarMat = new THREE.MeshStandardMaterial({
    color: pal.earInner,
    roughness: 0.72,
    metalness: 0.02
  });
  const noseMat = new THREE.MeshStandardMaterial({
    color: pal.nose,
    roughness: 0.25,
    metalness: 0.1
  });
  const blushMat = new THREE.MeshStandardMaterial({
    color: 0xfb7185,
    roughness: 0.85,
    metalness: 0.0,
    transparent: true,
    opacity: 0.45
  });
  const eyeWhiteMat = new THREE.MeshPhysicalMaterial({
    color: 0xffffff,
    roughness: 0.08,
    metalness: 0.0,
    clearcoat: 1.0,
    clearcoatRoughness: 0.05
  });
  const eyePupilMat = new THREE.MeshPhysicalMaterial({
    color: 0x0b1120,
    roughness: 0.05,
    metalness: 0.08,
    clearcoat: 1.0,
    clearcoatRoughness: 0.04
  });
  const eyeIrisMat = new THREE.MeshPhysicalMaterial({
    color: pal.eyeIris,
    roughness: 0.12,
    metalness: 0.05,
    clearcoat: 0.9
  });

  // Pedestal base & radial contact shadow
  if (includePedestal) {
    const pedTex = createPedestalTexture(species);
    const pedGeo = new THREE.CylinderGeometry(1.42, 1.52, 0.14, 48);
    const pedMat = new THREE.MeshStandardMaterial({
      map: pedTex,
      roughness: 0.78,
      metalness: 0.12
    });
    const pedRimGeo = new THREE.TorusGeometry(1.42, 0.032, 12, 56);
    const pedRimMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(pal.rugAccent),
      roughness: 0.32,
      metalness: 0.65
    });
    const pedestal = new THREE.Mesh(pedGeo, pedMat);
    pedestal.position.y = -0.07;
    pedestal.receiveShadow = shadowMapEnabled;
    root.add(pedestal);

    const pedRim = new THREE.Mesh(pedRimGeo, pedRimMat);
    pedRim.rotation.x = Math.PI / 2;
    pedRim.position.y = 0.0;
    root.add(pedRim);
  }

  const shadowMat = new THREE.MeshBasicMaterial({
    map: createContactShadowTexture(),
    transparent: true,
    opacity: 0.46,
    depthWrite: false
  });
  const shadowPlane = new THREE.Mesh(new THREE.PlaneGeometry(1.15, 1.15), shadowMat);
  shadowPlane.rotation.x = -Math.PI / 2;
  shadowPlane.position.y = 0.015;
  root.add(shadowPlane);

  // Character body pivot (bottom-center near y=0)
  const bodyGroup = new THREE.Group();
  bodyGroup.name = 'bodyGroup';
  bodyGroup.position.set(0, 0.02, 0);
  root.add(bodyGroup);

  // Sculpted torso
  const torsoMesh = new THREE.Mesh(
    new THREE.SphereGeometry(0.42, 28, 22),
    species === 'panda' ? bellyMat : primaryMat
  );
  torsoMesh.scale.set(0.98, 1.05, 0.88);
  torsoMesh.position.set(0, 0.46, 0);
  torsoMesh.castShadow = shadowMapEnabled;
  torsoMesh.receiveShadow = shadowMapEnabled;
  bodyGroup.add(torsoMesh);

  // Belly crest / Panda saddle
  if (species === 'panda') {
    const saddle = new THREE.Mesh(new THREE.TorusGeometry(0.32, 0.11, 14, 32), secondaryMat);
    saddle.rotation.x = Math.PI / 2 + 0.15;
    saddle.position.set(0, 0.64, -0.01);
    saddle.scale.set(1.06, 0.9, 1.0);
    saddle.castShadow = shadowMapEnabled;
    bodyGroup.add(saddle);
  } else {
    const belly = new THREE.Mesh(new THREE.SphereGeometry(0.31, 22, 18), bellyMat);
    belly.scale.set(0.92, 1.05, 0.55);
    belly.position.set(0, 0.43, 0.21);
    bodyGroup.add(belly);
  }

  // Four limbs (pivoted near body sockets for bouncy walk / tuck animations)
  const limbMat = species === 'panda' || species === 'fox' ? secondaryMat : primaryMat;
  const pawTipMat = species === 'panda' ? secondaryMat : bellyMat;
  const makeLimb = (x: number, y: number, z: number, isArm: boolean): THREE.Group => {
    const g = new THREE.Group();
    g.position.set(x, y, z);
    const len = isArm ? 0.24 : 0.2;
    const cyl = new THREE.Mesh(new THREE.CapsuleGeometry(0.095, len * 0.5, 8, 14), limbMat);
    cyl.position.y = -len * 0.45;
    cyl.castShadow = shadowMapEnabled;
    g.add(cyl);
    const paw = new THREE.Mesh(new THREE.SphereGeometry(0.105, 14, 12), pawTipMat);
    paw.scale.set(1.05, 0.72, 1.2);
    paw.position.set(0, -len * 0.82, 0.03);
    paw.castShadow = shadowMapEnabled;
    g.add(paw);
    return g;
  };

  const limbFL = makeLimb(-0.27, 0.44, 0.22, true);
  limbFL.name = 'limbFL';
  const limbFR = makeLimb(0.27, 0.44, 0.22, true);
  limbFR.name = 'limbFR';
  const limbBL = makeLimb(-0.24, 0.21, -0.08, false);
  limbBL.name = 'limbBL';
  const limbBR = makeLimb(0.24, 0.21, -0.08, false);
  limbBR.name = 'limbBR';
  bodyGroup.add(limbFL, limbFR, limbBL, limbBR);

  // Owl sculpted side wings
  let wingL: THREE.Group | undefined;
  let wingR: THREE.Group | undefined;
  if (species === 'owl') {
    const makeWing = (side: -1 | 1): THREE.Group => {
      const wg = new THREE.Group();
      wg.position.set(side * 0.37, 0.58, 0.0);
      const feather = new THREE.Mesh(new THREE.SphereGeometry(0.22, 18, 16), secondaryMat);
      feather.scale.set(0.38, 1.35, 0.85);
      feather.position.set(side * 0.07, -0.15, -0.02);
      feather.rotation.z = side * -0.18;
      feather.castShadow = shadowMapEnabled;
      wg.add(feather);
      return wg;
    };
    wingL = makeWing(-1);
    wingL.name = 'wingL';
    wingR = makeWing(1);
    wingR.name = 'wingR';
    bodyGroup.add(wingL, wingR);
  }

  // Articulated species tail
  const tailPivot = new THREE.Group();
  tailPivot.name = 'tailPivot';
  tailPivot.position.set(0, 0.26, -0.35);
  bodyGroup.add(tailPivot);

  if (species === 'fox') {
    const tailBase = new THREE.Mesh(new THREE.CapsuleGeometry(0.14, 0.36, 10, 16), primaryMat);
    tailBase.rotation.x = -0.95;
    tailBase.position.set(0, 0.16, -0.18);
    tailBase.castShadow = shadowMapEnabled;
    const tailTip = new THREE.Mesh(new THREE.ConeGeometry(0.145, 0.26, 16), bellyMat);
    tailTip.rotation.x = -0.95;
    tailTip.position.set(0, 0.32, -0.36);
    tailPivot.add(tailBase, tailTip);
  } else if (species === 'cat') {
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(0, 0.12, -0.22),
      new THREE.Vector3(0.06, 0.36, -0.32),
      new THREE.Vector3(-0.02, 0.52, -0.22)
    ]);
    const tailGeo = new THREE.TubeGeometry(curve, 20, 0.065, 10, false);
    const tailMesh = new THREE.Mesh(tailGeo, primaryMat);
    tailMesh.castShadow = shadowMapEnabled;
    const tipBall = new THREE.Mesh(new THREE.SphereGeometry(0.072, 12, 10), bellyMat);
    tipBall.position.set(-0.02, 0.52, -0.22);
    tailPivot.add(tailMesh, tipBall);
  } else if (species === 'panda') {
    const pom = new THREE.Mesh(new THREE.SphereGeometry(0.12, 14, 12), secondaryMat);
    pom.position.set(0, 0.05, -0.06);
    tailPivot.add(pom);
  } else {
    // Owl tail fan
    for (let i = -1; i <= 1; i++) {
      const f = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.035, 0.28), secondaryMat);
      f.position.set(i * 0.08, 0.03, -0.12);
      f.rotation.y = i * 0.22;
      tailPivot.add(f);
    }
  }

  // Head Pivot & Sculpted Facial Features
  const headPivot = new THREE.Group();
  headPivot.name = 'headPivot';
  headPivot.position.set(0, 0.9, 0.02);
  bodyGroup.add(headPivot);

  const headMesh = new THREE.Mesh(
    new THREE.SphereGeometry(0.45, 32, 26),
    species === 'panda' ? bellyMat : primaryMat
  );
  headMesh.scale.set(1.08, 0.96, 1.0);
  headMesh.castShadow = shadowMapEnabled;
  headMesh.receiveShadow = shadowMapEnabled;
  headPivot.add(headMesh);

  // Cheeks / Facial Mask
  if (species === 'panda') {
    [-1, 1].forEach(side => {
      const patch = new THREE.Mesh(new THREE.SphereGeometry(0.13, 18, 16), secondaryMat);
      patch.scale.set(1.15, 0.88, 0.45);
      patch.position.set(side * 0.17, 0.04, 0.39);
      patch.rotation.z = side * -0.28;
      headPivot.add(patch);
    });
  } else if (species === 'owl') {
    [-1, 1].forEach(side => {
      const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.05, 24), bellyMat);
      disc.rotation.x = Math.PI / 2;
      disc.position.set(side * 0.16, 0.05, 0.39);
      headPivot.add(disc);
    });
  } else {
    // Fox & Cat soft cream muzzle & cheek puffs
    const muzzle = new THREE.Mesh(new THREE.SphereGeometry(0.24, 22, 18), bellyMat);
    muzzle.scale.set(1.22, 0.74, 0.92);
    muzzle.position.set(0, -0.1, 0.3);
    headPivot.add(muzzle);

    if (species === 'fox') {
      const snout = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.26, 18), bellyMat);
      snout.rotation.x = Math.PI / 2;
      snout.position.set(0, -0.11, 0.46);
      headPivot.add(snout);
    }
  }

  // Blush cheeks
  [-1, 1].forEach(side => {
    const cheek = new THREE.Mesh(new THREE.SphereGeometry(0.065, 12, 10), blushMat);
    cheek.scale.set(1.3, 0.75, 0.45);
    cheek.position.set(side * 0.28, -0.07, 0.35);
    headPivot.add(cheek);
  });

  // Glossy Eyes + Rotating Upper Eyelids
  const makeEye = (side: -1 | 1): THREE.Mesh => {
    const eyeGroup = new THREE.Group();
    eyeGroup.position.set(side * 0.165, 0.05, 0.415);
    headPivot.add(eyeGroup);

    const iris = new THREE.Mesh(
      new THREE.SphereGeometry(species === 'owl' ? 0.088 : 0.068, 18, 16),
      species === 'owl' ? eyeIrisMat : eyePupilMat
    );
    eyeGroup.add(iris);

    if (species === 'owl') {
      const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.05, 14, 12), eyePupilMat);
      pupil.position.z = 0.052;
      eyeGroup.add(pupil);
    } else if (species === 'panda') {
      const whiteRim = new THREE.Mesh(new THREE.SphereGeometry(0.074, 16, 14), eyeWhiteMat);
      whiteRim.scale.set(1.05, 1.05, 0.7);
      whiteRim.position.z = -0.015;
      eyeGroup.add(whiteRim);
    }

    // Specular sparkle catchlight
    const glint = new THREE.Mesh(new THREE.SphereGeometry(0.02, 10, 10), eyeWhiteMat);
    glint.position.set(0.024, 0.026, 0.06);
    eyeGroup.add(glint);

    // Animated eyelid shell (rotates from -1.45 open -> 0 closed)
    const lidMat = species === 'panda' ? secondaryMat : primaryMat;
    const lid = new THREE.Mesh(
      new THREE.SphereGeometry(species === 'owl' ? 0.095 : 0.078, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.54),
      lidMat
    );
    lid.rotation.x = -1.45;
    eyeGroup.add(lid);
    return lid;
  };

  const eyelidL = makeEye(-1);
  eyelidL.name = 'eyelidL';
  const eyelidR = makeEye(1);
  eyelidR.name = 'eyelidR';

  // Nose or Owl Beak
  if (species === 'owl') {
    const beak = new THREE.Mesh(new THREE.ConeGeometry(0.065, 0.14, 12), noseMat);
    beak.rotation.x = Math.PI / 2 + 0.2;
    beak.position.set(0, -0.05, 0.47);
    headPivot.add(beak);
  } else {
    const nose = new THREE.Mesh(new THREE.SphereGeometry(0.052, 14, 12), noseMat);
    nose.scale.set(1.2, 0.85, 0.9);
    nose.position.set(0, -0.07, species === 'fox' ? 0.56 : 0.48);
    headPivot.add(nose);
  }

  // Animated Jaw / Happy Mouth
  const jawGroup = new THREE.Group();
  jawGroup.name = 'jawGroup';
  jawGroup.position.set(0, -0.155, species === 'fox' ? 0.43 : 0.4);
  headPivot.add(jawGroup);
  const mouthMat = new THREE.MeshStandardMaterial({
    color: 0xf43f5e,
    roughness: 0.45,
    metalness: 0.05
  });
  const tongue = new THREE.Mesh(new THREE.SphereGeometry(0.048, 12, 10), mouthMat);
  tongue.scale.set(1.2, 0.55, 0.7);
  jawGroup.add(tongue);

  // Ears by Species
  const makeEar = (side: -1 | 1): THREE.Group => {
    const eg = new THREE.Group();
    if (species === 'panda') {
      eg.position.set(side * 0.34, 0.34, -0.02);
      const earBall = new THREE.Mesh(new THREE.SphereGeometry(0.145, 16, 14), secondaryMat);
      earBall.scale.set(1.0, 1.0, 0.68);
      earBall.castShadow = shadowMapEnabled;
      eg.add(earBall);
    } else if (species === 'owl') {
      eg.position.set(side * 0.31, 0.34, 0.02);
      const tuft = new THREE.Mesh(new THREE.ConeGeometry(0.11, 0.24, 10), secondaryMat);
      tuft.rotation.z = side * -0.55;
      tuft.castShadow = shadowMapEnabled;
      eg.add(tuft);
    } else {
      const h = species === 'fox' ? 0.34 : 0.27;
      const r = species === 'fox' ? 0.14 : 0.13;
      eg.position.set(side * 0.27, 0.33, 0.01);
      const outer = new THREE.Mesh(new THREE.ConeGeometry(r, h, 14), primaryMat);
      outer.position.y = h * 0.45;
      outer.rotation.z = side * -0.28;
      outer.castShadow = shadowMapEnabled;
      const inner = new THREE.Mesh(new THREE.ConeGeometry(r * 0.58, h * 0.7, 12), innerEarMat);
      inner.position.set(0, h * 0.42, 0.032);
      inner.rotation.z = side * -0.28;
      eg.add(outer, inner);
    }
    headPivot.add(eg);
    return eg;
  };
  const earL = makeEar(-1);
  earL.name = 'earL';
  const earR = makeEar(1);
  earR.name = 'earR';

  // Equipped 3D Accessories attached directly to bone pivots!
  if (equippedAccessories.includes('scholar-glasses')) {
    const rimMat = new THREE.MeshStandardMaterial({
      color: 0xfbbf24,
      roughness: 0.22,
      metalness: 0.88
    });
    const lensMat = new THREE.MeshPhysicalMaterial({
      color: 0xbae6fd,
      transparent: true,
      opacity: 0.28,
      roughness: 0.05,
      metalness: 0.1,
      clearcoat: 1.0
    });
    const glassGroup = new THREE.Group();
    glassGroup.position.set(0, 0.05, 0.48);
    [-1, 1].forEach(side => {
      const frame = new THREE.Mesh(new THREE.TorusGeometry(0.105, 0.014, 10, 28), rimMat);
      frame.position.x = side * 0.165;
      const lens = new THREE.Mesh(new THREE.CircleGeometry(0.098, 24), lensMat);
      lens.position.set(side * 0.165, 0, 0.002);
      glassGroup.add(frame, lens);
    });
    const bridge = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, 0.13, 8), rimMat);
    bridge.rotation.z = Math.PI / 2;
    glassGroup.add(bridge);
    headPivot.add(glassGroup);
  }

  if (equippedAccessories.includes('carbon-cap')) {
    const capMat = new THREE.MeshStandardMaterial({
      color: 0x1d4ed8,
      roughness: 0.48,
      metalness: 0.15
    });
    const visorMat = new THREE.MeshStandardMaterial({
      color: 0x0f172a,
      roughness: 0.35,
      metalness: 0.25
    });
    const capGroup = new THREE.Group();
    capGroup.position.set(0, 0.31, 0.04);
    capGroup.rotation.x = -0.14;
    const crown = new THREE.Mesh(
      new THREE.SphereGeometry(0.36, 24, 16, 0, Math.PI * 2, 0, Math.PI * 0.5),
      capMat
    );
    crown.scale.set(1.02, 0.72, 1.05);
    const visor = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.34, 0.04, 24, 1, false, -0.9, 1.8), visorMat);
    visor.position.set(0, 0.02, 0.22);
    const buttonTop = new THREE.Mesh(new THREE.SphereGeometry(0.045, 10, 8), visorMat);
    buttonTop.position.set(0, 0.27, 0);
    capGroup.add(crown, visor, buttonTop);
    headPivot.add(capGroup);
  }

  if (equippedAccessories.includes('headphones')) {
    const arcMat = new THREE.MeshStandardMaterial({
      color: 0x38bdf8,
      roughness: 0.28,
      metalness: 0.72
    });
    const cupMat = new THREE.MeshStandardMaterial({
      color: 0x0f172a,
      roughness: 0.42,
      metalness: 0.35
    });
    const hpGroup = new THREE.Group();
    const band = new THREE.Mesh(new THREE.TorusGeometry(0.47, 0.032, 10, 32, Math.PI), arcMat);
    band.position.set(0, 0.05, 0);
    hpGroup.add(band);
    [-1, 1].forEach(side => {
      const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.09, 20), cupMat);
      cup.rotation.z = Math.PI / 2;
      cup.position.set(side * 0.49, 0.02, 0);
      const glow = new THREE.Mesh(new THREE.TorusGeometry(0.085, 0.012, 8, 20), arcMat);
      glow.rotation.y = Math.PI / 2;
      glow.position.set(side * 0.535, 0.02, 0);
      hpGroup.add(cup, glow);
    });
    headPivot.add(hpGroup);
  }

  if (equippedAccessories.includes('cozy-scarf')) {
    const scarfMat = new THREE.MeshStandardMaterial({
      color: 0xe11d48,
      roughness: 0.88,
      metalness: 0.02
    });
    const scarfGroup = new THREE.Group();
    scarfGroup.position.set(0, 0.66, 0.04);
    const collar = new THREE.Mesh(new THREE.TorusGeometry(0.31, 0.08, 12, 32), scarfMat);
    collar.rotation.x = Math.PI / 2;
    const tailDrop = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.28, 0.06), scarfMat);
    tailDrop.position.set(0.16, -0.14, 0.28);
    tailDrop.rotation.set(-0.22, 0.2, -0.15);
    scarfGroup.add(collar, tailDrop);
    bodyGroup.add(scarfGroup);
  }

  // Orbiting 3D Star Lantern
  let lanternGroup: THREE.Group | undefined;
  if (equippedAccessories.includes('star-lantern')) {
    lanternGroup = new THREE.Group();
    const brassMat = new THREE.MeshStandardMaterial({
      color: 0xf59e0b,
      roughness: 0.25,
      metalness: 0.85
    });
    const coreMat = new THREE.MeshStandardMaterial({
      color: 0xfef08a,
      emissive: 0xfacc15,
      emissiveIntensity: 1.5,
      roughness: 0.15
    });
    const core = new THREE.Mesh(new THREE.OctahedronGeometry(0.11, 0), coreMat);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.15, 0.014, 8, 24), brassMat);
    ring.rotation.x = 0.7;
    const cap = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.08, 6), brassMat);
    cap.position.y = 0.14;
    lanternGroup.add(core, ring, cap);
    root.add(lanternGroup);
  }

  // Tag pet hierarchy as directly clickable ('pet')
  markInteractable(bodyGroup, 'pet', interactables);

  // Interactive 3D World Props (Ball for Play, Moon Cushion for Sleep, Treat Bowl for Feed)
  let toyGroup: THREE.Group | undefined;
  let bowlGroup: THREE.Group | undefined;
  let moonLight: THREE.PointLight | undefined;
  let moonMat: THREE.MeshStandardMaterial | undefined;

  if (includeProps) {
    // 1. 3D Bouncing Striped Toy Ball (Play trigger)
    toyGroup = new THREE.Group();
    toyGroup.position.set(0.92, 0.16, 0.55);
    const ballMat = new THREE.MeshStandardMaterial({
      color: pal.toyPrimary,
      roughness: 0.28,
      metalness: 0.15
    });
    const stripeMat = new THREE.MeshStandardMaterial({
      color: pal.toyStripe,
      roughness: 0.3,
      metalness: 0.1
    });
    const ball = new THREE.Mesh(new THREE.SphereGeometry(0.16, 22, 18), ballMat);
    ball.castShadow = shadowMapEnabled;
    const band = new THREE.Mesh(new THREE.TorusGeometry(0.155, 0.022, 10, 28), stripeMat);
    toyGroup.add(ball, band);
    markInteractable(toyGroup, 'play', interactables);
    root.add(toyGroup);

    // 2. 3D Cozy Cushion + Crescent Night Lamp (Sleep/Wake trigger)
    const bedGroup = new THREE.Group();
    bedGroup.position.set(-0.88, 0.02, -0.45);
    const pillowMat = new THREE.MeshStandardMaterial({
      color: 0x38bdf8,
      roughness: 0.9,
      metalness: 0.02
    });
    const pillow = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.35, 0.11, 24), pillowMat);
    pillow.position.y = 0.055;
    pillow.receiveShadow = shadowMapEnabled;
    pillow.castShadow = shadowMapEnabled;
    bedGroup.add(pillow);

    moonMat = new THREE.MeshStandardMaterial({
      color: 0xfde047,
      emissive: 0xfbbf24,
      emissiveIntensity: 0.5,
      roughness: 0.2
    });
    const stand = new THREE.Mesh(
      new THREE.CylinderGeometry(0.02, 0.03, 0.42, 10),
      new THREE.MeshStandardMaterial({ color: 0x94a3b8, roughness: 0.3, metalness: 0.8 })
    );
    stand.position.set(-0.22, 0.22, -0.18);
    const moon = new THREE.Mesh(new THREE.TorusGeometry(0.11, 0.034, 10, 24, Math.PI * 1.45), moonMat);
    moon.position.set(-0.22, 0.46, -0.18);
    moon.rotation.z = 0.8;
    bedGroup.add(stand, moon);

    moonLight = new THREE.PointLight(0xfde047, 0.45, 2.2);
    moonLight.position.set(-0.22, 0.48, -0.15);
    bedGroup.add(moonLight);

    markInteractable(bedGroup, 'sleep', interactables);
    root.add(bedGroup);

    // 3. 3D Ceramic Bowl & Treats (Eat trigger)
    bowlGroup = new THREE.Group();
    bowlGroup.position.set(-0.82, 0.02, 0.58);
    const ceramicMat = new THREE.MeshPhysicalMaterial({
      color: 0x10b981,
      roughness: 0.22,
      metalness: 0.08,
      clearcoat: 0.85
    });
    const rim = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.19, 0.13, 24), ceramicMat);
    rim.position.y = 0.065;
    rim.castShadow = shadowMapEnabled;
    rim.receiveShadow = shadowMapEnabled;
    bowlGroup.add(rim);

    const treatColors = [0xf59e0b, 0x3b82f6, 0xec4899, 0xfbbf24];
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2;
      const pellet = new THREE.Mesh(
        new THREE.SphereGeometry(0.055, 12, 10),
        new THREE.MeshStandardMaterial({ color: treatColors[i], roughness: 0.55 })
      );
      pellet.position.set(Math.cos(a) * 0.075, 0.13, Math.sin(a) * 0.075);
      bowlGroup.add(pellet);
    }
    markInteractable(bowlGroup, 'eat', interactables);
    root.add(bowlGroup);
  }

  // Floating 3D Sleep Zzz Sprites
  const zzzTex = createEmojiGlyphTexture('Z', '#93c5fd');
  const zzzSprites: THREE.Sprite[] = [];
  for (let i = 0; i < 3; i++) {
    const sp = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: zzzTex, transparent: true, opacity: 0, depthWrite: false })
    );
    sp.scale.set(0.22, 0.22, 1);
    sp.visible = false;
    root.add(sp);
    zzzSprites.push(sp);
  }

  // Interactive Burst Sprites (Hearts / Stars)
  const heartTex = createEmojiGlyphTexture('♥', '#fb7185');
  const starTex = createEmojiGlyphTexture('★', '#fde047');
  const burstSprites: THREE.Sprite[] = [];
  for (let i = 0; i < 6; i++) {
    const sp = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: i % 2 === 0 ? heartTex : starTex,
        transparent: true,
        opacity: 0,
        depthWrite: false
      })
    );
    sp.scale.set(0.2, 0.2, 1);
    sp.visible = false;
    root.add(sp);
    burstSprites.push(sp);
  }

  return {
    root,
    bodyGroup,
    headPivot,
    earL,
    earR,
    eyelidL,
    eyelidR,
    jawGroup,
    tailPivot,
    wingL,
    wingR,
    limbFL,
    limbFR,
    limbBL,
    limbBR,
    toyGroup,
    bowlGroup,
    moonLight,
    moonMat,
    lanternGroup,
    zzzSprites,
    burstSprites,
    interactables
  };
}

/**
 * Applies solved Pet3DRigPose to Three.js rig handles without allocating memory.
 */
export function applyPoseToPetRig(rig: PetRigHandles, pose: Pet3DRigPose): void {
  rig.bodyGroup.position.set(pose.bodyPosX, pose.bodyPosY + 0.02, pose.bodyPosZ);
  rig.bodyGroup.rotation.set(pose.bodyRotX, pose.bodyRotY, pose.bodyRotZ);
  rig.bodyGroup.scale.set(pose.bodyScaleX, pose.bodyScaleY, pose.bodyScaleZ);

  rig.headPivot.rotation.set(pose.headRotX, pose.headRotY, pose.headRotZ);
  rig.earL.rotation.z = pose.earRotZ;
  rig.earR.rotation.z = -pose.earRotZ;

  // Eyelids smoothly swing from -1.48 (open) to 0.08 (closed)
  const lidAngle = THREE.MathUtils.lerp(-1.48, 0.08, pose.eyelidClosed);
  rig.eyelidL.rotation.x = lidAngle;
  rig.eyelidR.rotation.x = lidAngle;

  rig.jawGroup.scale.y = 0.6 + pose.mouthOpen * 1.1;
  rig.tailPivot.rotation.set(pose.tailRotX, pose.tailRotY, 0);

  if (rig.wingL && rig.wingR) {
    rig.wingL.rotation.z = -pose.wingAngle;
    rig.wingR.rotation.z = pose.wingAngle;
  }

  rig.limbFL.rotation.x = pose.pawSwingFL;
  rig.limbFR.rotation.x = pose.pawSwingFR;
  rig.limbBL.rotation.x = pose.pawSwingBL;
  rig.limbBR.rotation.x = pose.pawSwingBR;

  if (rig.toyGroup) {
    rig.toyGroup.position.set(pose.toyPosX, pose.toyPosY, pose.toyPosZ);
    rig.toyGroup.rotation.set(pose.toyRotX, 0, pose.toyRotZ);
  }
  if (rig.bowlGroup) {
    rig.bowlGroup.rotation.y = pose.bowlSpin;
  }
  if (rig.moonLight && rig.moonMat) {
    rig.moonLight.intensity = pose.moonGlow;
    rig.moonMat.emissiveIntensity = pose.moonGlow * 0.85;
  }
  if (rig.lanternGroup) {
    const r = 0.92;
    rig.lanternGroup.position.set(
      Math.cos(pose.lanternOrbitAngle) * r,
      pose.lanternBobY,
      Math.sin(pose.lanternOrbitAngle) * r
    );
    rig.lanternGroup.rotation.y = -pose.lanternOrbitAngle;
  }

  // Zzz sleep particles
  for (let i = 0; i < rig.zzzSprites.length; i++) {
    const sp = rig.zzzSprites[i];
    sp.visible = pose.zzzVisible;
    if (pose.zzzVisible) {
      const t = (pose.zzzProgress + i * 0.33) % 1;
      sp.position.set(-0.18 + t * 0.25 + i * 0.08, 1.25 + t * 0.68, 0.15);
      const s = 0.14 + t * 0.16;
      sp.scale.set(s, s, 1);
      (sp.material as THREE.SpriteMaterial).opacity = Math.sin(t * Math.PI);
    }
  }

  // Affection / Snack Burst particles
  const bursting = pose.particleBurstProgress > 0 && pose.particleBurstProgress < 1;
  for (let i = 0; i < rig.burstSprites.length; i++) {
    const sp = rig.burstSprites[i];
    sp.visible = bursting;
    if (bursting) {
      const p = pose.particleBurstProgress;
      const a = (i / rig.burstSprites.length) * Math.PI * 2 + 0.3;
      const radius = 0.28 + p * 0.72;
      sp.position.set(Math.cos(a) * radius, 0.95 + p * 0.85 + (i % 2) * 0.12, Math.sin(a) * radius);
      const s = 0.22 * (1 - p * 0.35);
      sp.scale.set(s, s, 1);
      (sp.material as THREE.SpriteMaterial).opacity = Math.sin(p * Math.PI);
    }
  }
}

export function disposeThreeObjectTree(root: THREE.Object3D): void {
  root.traverse(obj => {
    const mesh = obj as THREE.Mesh;
    if (mesh.geometry) {
      mesh.geometry.dispose();
    }
    const mat = (mesh as { material?: THREE.Material | THREE.Material[] }).material;
    if (mat) {
      const list = Array.isArray(mat) ? mat : [mat];
      for (const m of list) {
        const std = m as THREE.MeshStandardMaterial;
        if (std.map) std.map.dispose();
        m.dispose();
      }
    }
  });
}

let _speciesThumbCache: Record<PetSpecies, string> | null = null;

/**
 * Renders 4 crisp 3D studio portrait snapshots using ONE temporary offscreen WebGLRenderer
 * so species selector cards show genuine 3D models with zero extra live WebGL contexts.
 */
export function getSpecies3DThumbnailUrls(): Record<PetSpecies, string> | null {
  if (_speciesThumbCache) return _speciesThumbCache;
  if (typeof document === 'undefined') return null;

  try {
    const size = 128;
    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      preserveDrawingBuffer: true
    });
    renderer.setSize(size, size);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;

    const scene = new THREE.Scene();
    const pmrem = new THREE.PMREMGenerator(renderer);
    const envTex = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environment = envTex;
    pmrem.dispose();

    const hemi = new THREE.HemisphereLight(0xdbeafe, 0x0f172a, 0.85);
    const key = new THREE.DirectionalLight(0xfff7ed, 1.9);
    key.position.set(2.4, 3.8, 3.2);
    const rim = new THREE.DirectionalLight(0x60a5fa, 0.9);
    rim.position.set(-2.5, 2.0, -2.5);
    scene.add(hemi, key, rim);

    const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 20);
    camera.position.set(0.35, 1.15, 2.35);
    camera.lookAt(0, 0.72, 0);

    const speciesList: PetSpecies[] = ['fox', 'owl', 'cat', 'panda'];
    const result = {} as Record<PetSpecies, string>;

    for (const sp of speciesList) {
      const rig = buildPet3DSceneRig(sp, [], {
        includeProps: false,
        includePedestal: false,
        shadowMapEnabled: false
      });
      rig.root.rotation.y = 0.25;
      scene.add(rig.root);
      renderer.render(scene, camera);
      result[sp] = renderer.domElement.toDataURL('image/png');
      scene.remove(rig.root);
      disposeThreeObjectTree(rig.root);
    }

    envTex.dispose();
    renderer.dispose();
    renderer.getContext()?.getExtension('WEBGL_lose_context')?.loseContext();
    _speciesThumbCache = result;
    return result;
  } catch {
    return null;
  }
}

export interface PetStageWorldHandles {
  stageRoot: THREE.Group;
  toyGroup?: THREE.Group;
  bowlGroup?: THREE.Group;
  moonLight?: THREE.PointLight;
  moonMat?: THREE.MeshStandardMaterial;
  lanternGroup?: THREE.Group;
  zzzSprites: THREE.Sprite[];
  burstSprites: THREE.Sprite[];
  interactables: THREE.Object3D[];
}

/**
 * Builds the 3D studio stage pedestal, interactive props (toy ball, moon pillow, treat bowl),
 * orbiting star lantern, and Zzz / affection burst sprites separately from the loaded GLTF character.
 */
export function buildPetStageProps(
  species: PetSpecies,
  equippedAccessories: string[],
  options: BuildPet3DOptions = {}
): PetStageWorldHandles {
  const { includeProps = true, includePedestal = true, shadowMapEnabled = true } = options;
  const pal = SPECIES_PALETTES[species];
  const stageRoot = new THREE.Group();
  const interactables: THREE.Object3D[] = [];

  if (includePedestal) {
    const pedTex = createPedestalTexture(species);
    const pedGeo = new THREE.CylinderGeometry(1.42, 1.52, 0.14, 48);
    const pedMat = new THREE.MeshStandardMaterial({
      map: pedTex,
      roughness: 0.78,
      metalness: 0.12
    });
    const pedRimGeo = new THREE.TorusGeometry(1.42, 0.032, 12, 56);
    const pedRimMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(pal.rugAccent),
      roughness: 0.32,
      metalness: 0.65
    });
    const pedestal = new THREE.Mesh(pedGeo, pedMat);
    pedestal.position.y = -0.07;
    pedestal.receiveShadow = shadowMapEnabled;
    stageRoot.add(pedestal);

    const pedRim = new THREE.Mesh(pedRimGeo, pedRimMat);
    pedRim.rotation.x = Math.PI / 2;
    pedRim.position.y = 0.0;
    stageRoot.add(pedRim);
  }

  const shadowMat = new THREE.MeshBasicMaterial({
    map: createContactShadowTexture(),
    transparent: true,
    opacity: 0.46,
    depthWrite: false
  });
  const shadowPlane = new THREE.Mesh(new THREE.PlaneGeometry(1.15, 1.15), shadowMat);
  shadowPlane.rotation.x = -Math.PI / 2;
  shadowPlane.position.y = 0.015;
  stageRoot.add(shadowPlane);

  let lanternGroup: THREE.Group | undefined;
  if (equippedAccessories.includes('star-lantern')) {
    lanternGroup = new THREE.Group();
    const brassMat = new THREE.MeshStandardMaterial({
      color: 0xf59e0b,
      roughness: 0.25,
      metalness: 0.85
    });
    const coreMat = new THREE.MeshStandardMaterial({
      color: 0xfef08a,
      emissive: 0xfacc15,
      emissiveIntensity: 1.5,
      roughness: 0.15
    });
    const core = new THREE.Mesh(new THREE.OctahedronGeometry(0.11, 0), coreMat);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.15, 0.014, 8, 24), brassMat);
    ring.rotation.x = 0.7;
    const cap = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.08, 6), brassMat);
    cap.position.y = 0.14;
    lanternGroup.add(core, ring, cap);
    stageRoot.add(lanternGroup);
  }

  let toyGroup: THREE.Group | undefined;
  let bowlGroup: THREE.Group | undefined;
  let moonLight: THREE.PointLight | undefined;
  let moonMat: THREE.MeshStandardMaterial | undefined;

  if (includeProps) {
    toyGroup = new THREE.Group();
    toyGroup.position.set(0.92, 0.16, 0.55);
    const ballMat = new THREE.MeshStandardMaterial({
      color: pal.toyPrimary,
      roughness: 0.28,
      metalness: 0.15
    });
    const stripeMat = new THREE.MeshStandardMaterial({
      color: pal.toyStripe,
      roughness: 0.3,
      metalness: 0.1
    });
    const ball = new THREE.Mesh(new THREE.SphereGeometry(0.16, 22, 18), ballMat);
    ball.castShadow = shadowMapEnabled;
    const band = new THREE.Mesh(new THREE.TorusGeometry(0.155, 0.022, 10, 28), stripeMat);
    toyGroup.add(ball, band);
    markInteractable(toyGroup, 'play', interactables);
    stageRoot.add(toyGroup);

    const bedGroup = new THREE.Group();
    bedGroup.position.set(-0.88, 0.02, -0.45);
    const pillowMat = new THREE.MeshStandardMaterial({
      color: 0x38bdf8,
      roughness: 0.9,
      metalness: 0.02
    });
    const pillow = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.35, 0.11, 24), pillowMat);
    pillow.position.y = 0.055;
    pillow.receiveShadow = shadowMapEnabled;
    pillow.castShadow = shadowMapEnabled;
    bedGroup.add(pillow);

    moonMat = new THREE.MeshStandardMaterial({
      color: 0xfde047,
      emissive: 0xfbbf24,
      emissiveIntensity: 0.5,
      roughness: 0.2
    });
    const stand = new THREE.Mesh(
      new THREE.CylinderGeometry(0.02, 0.03, 0.42, 10),
      new THREE.MeshStandardMaterial({ color: 0x94a3b8, roughness: 0.3, metalness: 0.8 })
    );
    stand.position.set(-0.22, 0.22, -0.18);
    const moon = new THREE.Mesh(
      new THREE.TorusGeometry(0.11, 0.034, 10, 24, Math.PI * 1.45),
      moonMat
    );
    moon.position.set(-0.22, 0.46, -0.18);
    moon.rotation.z = 0.8;
    bedGroup.add(stand, moon);

    moonLight = new THREE.PointLight(0xfde047, 0.45, 2.2);
    moonLight.position.set(-0.22, 0.48, -0.15);
    bedGroup.add(moonLight);

    markInteractable(bedGroup, 'sleep', interactables);
    stageRoot.add(bedGroup);

    bowlGroup = new THREE.Group();
    bowlGroup.position.set(-0.82, 0.02, 0.58);
    const ceramicMat = new THREE.MeshPhysicalMaterial({
      color: 0x10b981,
      roughness: 0.22,
      metalness: 0.08,
      clearcoat: 0.85
    });
    const rim = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.19, 0.13, 24), ceramicMat);
    rim.position.y = 0.065;
    rim.castShadow = shadowMapEnabled;
    rim.receiveShadow = shadowMapEnabled;
    bowlGroup.add(rim);

    const treatColors = [0xf59e0b, 0x3b82f6, 0xec4899, 0xfbbf24];
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2;
      const pellet = new THREE.Mesh(
        new THREE.SphereGeometry(0.055, 12, 10),
        new THREE.MeshStandardMaterial({ color: treatColors[i], roughness: 0.55 })
      );
      pellet.position.set(Math.cos(a) * 0.075, 0.13, Math.sin(a) * 0.075);
      bowlGroup.add(pellet);
    }
    markInteractable(bowlGroup, 'eat', interactables);
    stageRoot.add(bowlGroup);
  }

  const zzzTex = createEmojiGlyphTexture('Z', '#93c5fd');
  const zzzSprites: THREE.Sprite[] = [];
  for (let i = 0; i < 3; i++) {
    const sp = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: zzzTex, transparent: true, opacity: 0, depthWrite: false })
    );
    sp.scale.set(0.22, 0.22, 1);
    sp.visible = false;
    stageRoot.add(sp);
    zzzSprites.push(sp);
  }

  const heartTex = createEmojiGlyphTexture('♥', '#fb7185');
  const starTex = createEmojiGlyphTexture('★', '#fde047');
  const burstSprites: THREE.Sprite[] = [];
  for (let i = 0; i < 6; i++) {
    const sp = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: i % 2 === 0 ? heartTex : starTex,
        transparent: true,
        opacity: 0,
        depthWrite: false
      })
    );
    sp.scale.set(0.2, 0.2, 1);
    sp.visible = false;
    stageRoot.add(sp);
    burstSprites.push(sp);
  }

  return {
    stageRoot,
    toyGroup,
    bowlGroup,
    moonLight,
    moonMat,
    lanternGroup,
    zzzSprites,
    burstSprites,
    interactables
  };
}

/**
 * Applies stage prop animation (toy ball arc, bowl spin, moon glow, lantern orbit, Zzz & heart bursts).
 */
export function applyPoseToStageProps(stage: PetStageWorldHandles, pose: Pet3DRigPose): void {
  if (stage.toyGroup) {
    stage.toyGroup.position.set(pose.toyPosX, pose.toyPosY, pose.toyPosZ);
    stage.toyGroup.rotation.set(pose.toyRotX, 0, pose.toyRotZ);
  }
  if (stage.bowlGroup) {
    stage.bowlGroup.rotation.y = pose.bowlSpin;
  }
  if (stage.moonLight && stage.moonMat) {
    stage.moonLight.intensity = pose.moonGlow;
    stage.moonMat.emissiveIntensity = pose.moonGlow * 0.85;
  }
  if (stage.lanternGroup) {
    const r = 0.92;
    stage.lanternGroup.position.set(
      Math.cos(pose.lanternOrbitAngle) * r,
      pose.lanternBobY,
      Math.sin(pose.lanternOrbitAngle) * r
    );
    stage.lanternGroup.rotation.y = -pose.lanternOrbitAngle;
  }

  for (let i = 0; i < stage.zzzSprites.length; i++) {
    const sp = stage.zzzSprites[i];
    sp.visible = pose.zzzVisible;
    if (pose.zzzVisible) {
      const t = (pose.zzzProgress + i * 0.33) % 1;
      sp.position.set(-0.18 + t * 0.25 + i * 0.08, 1.25 + t * 0.68, 0.15);
      const s = 0.14 + t * 0.16;
      sp.scale.set(s, s, 1);
      (sp.material as THREE.SpriteMaterial).opacity = Math.sin(t * Math.PI);
    }
  }

  const bursting = pose.particleBurstProgress > 0 && pose.particleBurstProgress < 1;
  for (let i = 0; i < stage.burstSprites.length; i++) {
    const sp = stage.burstSprites[i];
    sp.visible = bursting;
    if (bursting) {
      const p = pose.particleBurstProgress;
      const a = (i / stage.burstSprites.length) * Math.PI * 2 + 0.3;
      const radius = 0.28 + p * 0.72;
      sp.position.set(
        Math.cos(a) * radius,
        0.95 + p * 0.85 + (i % 2) * 0.12,
        Math.sin(a) * radius
      );
      const s = 0.22 * (1 - p * 0.35);
      sp.scale.set(s, s, 1);
      (sp.material as THREE.SpriteMaterial).opacity = Math.sin(p * Math.PI);
    }
  }
}

/**
 * Compiles 4 seamless looping GLTF AnimationClips ('Idle', 'Playing', 'Sleep', 'Feeding')
 * targeting articulated bone pivots so AnimationMixer drives the loaded GLB model directly.
 */
export function buildSpeciesAnimationClips(species: PetSpecies): THREE.AnimationClip[] {
  const activities: Array<{ activity: PetActivityState; clipName: string; duration: number }> = [
    { activity: 'idle', clipName: 'Idle', duration: 3.6 },
    { activity: 'playing', clipName: 'Playing', duration: 2.4 },
    { activity: 'sleep', clipName: 'Sleep', duration: 4.0 },
    { activity: 'feeding', clipName: 'Feeding', duration: 2.4 }
  ];

  const euler = new THREE.Euler();
  const quat = new THREE.Quaternion();

  return activities.map(({ activity, clipName, duration }) => {
    const steps = 16;
    const times: number[] = [];
    const bodyPos: number[] = [];
    const bodyQuat: number[] = [];
    const bodyScale: number[] = [];
    const headQuat: number[] = [];
    const earLQuat: number[] = [];
    const earRQuat: number[] = [];
    const lidLQuat: number[] = [];
    const lidRQuat: number[] = [];
    const jawScale: number[] = [];
    const tailQuat: number[] = [];
    const limbFLQuat: number[] = [];
    const limbFRQuat: number[] = [];
    const limbBLQuat: number[] = [];
    const limbBRQuat: number[] = [];
    const wingLQuat: number[] = [];
    const wingRQuat: number[] = [];

    const pushQuat = (arr: number[], rx: number, ry: number, rz: number) => {
      euler.set(rx, ry, rz, 'XYZ');
      quat.setFromEuler(euler);
      arr.push(quat.x, quat.y, quat.z, quat.w);
    };

    for (let i = 0; i <= steps; i++) {
      // Repeat frame 0 at exact end index so LoopRepeat wraps seamlessly
      const t = (i / steps) * duration;
      const sampleElapsed = i === steps ? 0 : t;
      times.push(t);
      const p = solvePet3DPose({
        species,
        activity,
        elapsed: sampleElapsed,
        pointerX: 0,
        pointerY: 0,
        burstTime: -1,
        burstKind: null
      });

      bodyPos.push(p.bodyPosX, p.bodyPosY + 0.02, p.bodyPosZ);
      pushQuat(bodyQuat, p.bodyRotX, p.bodyRotY, p.bodyRotZ);
      bodyScale.push(p.bodyScaleX, p.bodyScaleY, p.bodyScaleZ);
      pushQuat(headQuat, p.headRotX, p.headRotY, p.headRotZ);
      pushQuat(earLQuat, 0, 0, p.earRotZ);
      pushQuat(earRQuat, 0, 0, -p.earRotZ);
      const lidAngle = THREE.MathUtils.lerp(-1.48, 0.08, p.eyelidClosed);
      pushQuat(lidLQuat, lidAngle, 0, 0);
      pushQuat(lidRQuat, lidAngle, 0, 0);
      jawScale.push(1, 0.6 + p.mouthOpen * 1.1, 1);
      pushQuat(tailQuat, p.tailRotX, p.tailRotY, 0);
      pushQuat(limbFLQuat, p.pawSwingFL, 0, 0);
      pushQuat(limbFRQuat, p.pawSwingFR, 0, 0);
      pushQuat(limbBLQuat, p.pawSwingBL, 0, 0);
      pushQuat(limbBRQuat, p.pawSwingBR, 0, 0);
      pushQuat(wingLQuat, 0, 0, -p.wingAngle);
      pushQuat(wingRQuat, 0, 0, p.wingAngle);
    }

    const tracks: THREE.KeyframeTrack[] = [
      new THREE.VectorKeyframeTrack('bodyGroup.position', times, bodyPos),
      new THREE.QuaternionKeyframeTrack('bodyGroup.quaternion', times, bodyQuat),
      new THREE.VectorKeyframeTrack('bodyGroup.scale', times, bodyScale),
      new THREE.QuaternionKeyframeTrack('headPivot.quaternion', times, headQuat),
      new THREE.QuaternionKeyframeTrack('earL.quaternion', times, earLQuat),
      new THREE.QuaternionKeyframeTrack('earR.quaternion', times, earRQuat),
      new THREE.QuaternionKeyframeTrack('eyelidL.quaternion', times, lidLQuat),
      new THREE.QuaternionKeyframeTrack('eyelidR.quaternion', times, lidRQuat),
      new THREE.VectorKeyframeTrack('jawGroup.scale', times, jawScale),
      new THREE.QuaternionKeyframeTrack('tailPivot.quaternion', times, tailQuat),
      new THREE.QuaternionKeyframeTrack('limbFL.quaternion', times, limbFLQuat),
      new THREE.QuaternionKeyframeTrack('limbFR.quaternion', times, limbFRQuat),
      new THREE.QuaternionKeyframeTrack('limbBL.quaternion', times, limbBLQuat),
      new THREE.QuaternionKeyframeTrack('limbBR.quaternion', times, limbBRQuat)
    ];

    if (species === 'owl') {
      tracks.push(
        new THREE.QuaternionKeyframeTrack('wingL.quaternion', times, wingLQuat),
        new THREE.QuaternionKeyframeTrack('wingR.quaternion', times, wingRQuat)
      );
    }

    return new THREE.AnimationClip(clipName, duration, tracks);
  });
}

const _builtInGlbCache = new Map<string, Promise<ArrayBuffer>>();

/**
 * Exports any built-in companion species + equipped accessories into a standard binary GLB ArrayBuffer
 * containing embedded textures, hierarchy nodes, and all 4 named AnimationClips ('Idle', 'Playing', 'Sleep', 'Feeding').
 */
export function compileSpeciesToGlbBuffer(
  species: PetSpecies,
  equippedAccessories: string[]
): Promise<ArrayBuffer> {
  const sortedAcc = [...equippedAccessories].sort().join('|');
  const key = `${species}::${sortedAcc}`;
  const existing = _builtInGlbCache.get(key);
  if (existing) return existing;

  const task = (async () => {
    const rig = buildPet3DSceneRig(species, equippedAccessories, {
      includeProps: false,
      includePedestal: false,
      shadowMapEnabled: true
    });
    // Strip contact shadow plane & star lantern sprite layers; export clean articulated character mesh
    const exportRoot = new THREE.Group();
    exportRoot.name = `NoSidian_${species}`;
    exportRoot.add(rig.bodyGroup);

    const clips = buildSpeciesAnimationClips(species);
    const exporter = new GLTFExporter();
    const result = await exporter.parseAsync(exportRoot, {
      binary: true,
      animations: clips
    });

    disposeThreeObjectTree(rig.root);
    disposeThreeObjectTree(exportRoot);

    if (result instanceof ArrayBuffer) {
      return result;
    }
    const jsonText = JSON.stringify(result);
    return new TextEncoder().encode(jsonText).buffer;
  })().catch(err => {
    _builtInGlbCache.delete(key);
    throw err;
  });

  _builtInGlbCache.set(key, task);
  return task;
}

export async function exportSpeciesGlbBlob(
  species: PetSpecies,
  equippedAccessories: string[]
): Promise<Blob> {
  const buf = await compileSpeciesToGlbBuffer(species, equippedAccessories);
  return new Blob([buf], { type: 'model/gltf-binary' });
}

