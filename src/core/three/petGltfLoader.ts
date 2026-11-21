import * as THREE from 'three';
import { GLTFLoader, type GLTF } from 'three/addons/loaders/GLTFLoader.js';
import {
  computeModelNormalizationTransform,
  mapAllActivityClips
} from '../petGltf';
import type { PetActivityState, PetSpecies } from '../types';
import { loadCustomPetModelBuffer } from '../utils/petModelStore';
import { compileSpeciesToGlbBuffer } from './pet3dBuilder';

export interface LoadedGltfCompanion {
  wrapperGroup: THREE.Group;
  modelRoot: THREE.Group;
  mixer: THREE.AnimationMixer;
  actions: Partial<Record<PetActivityState, { action: THREE.AnimationAction; timeScale: number }>>;
  clipNames: string[];
  currentActivity: PetActivityState | null;
  currentAction: THREE.AnimationAction | null;
  isCustomModel: boolean;
  hasRiggedBuiltInNodes: boolean;
  headPivot: THREE.Object3D | null;
  gazeBone: THREE.Object3D | null;
  gazeDrivenByClip: boolean;
  baseHeadEuler: THREE.Euler;
  eyelidL: THREE.Object3D | null;
  eyelidR: THREE.Object3D | null;
  interactables: THREE.Object3D[];
}

const _sharedGltfLoader = new GLTFLoader();

export async function parseGltfBuffer(buffer: ArrayBuffer): Promise<GLTF> {
  return _sharedGltfLoader.parseAsync(buffer, '');
}

/**
 * Validates and inspects an uploaded File (.glb or .gltf) through Three.js GLTFLoader
 * to extract animation clip names before persisting it.
 */
export async function inspectGltfFileBuffer(buffer: ArrayBuffer): Promise<{
  clipNames: string[];
  meshCount: number;
}> {
  const gltf = await parseGltfBuffer(buffer);
  let meshCount = 0;
  gltf.scene.traverse(obj => {
    if ((obj as THREE.Mesh).isMesh) meshCount += 1;
  });
  return {
    clipNames: gltf.animations.map(a => a.name).filter(Boolean),
    meshCount
  };
}

/**
 * Loads a GLTF/GLB companion character using Three.js GLTFLoader — either a custom user-uploaded
 * .glb/.gltf stored offline in IndexedDB or the compiled binary GLB for the active species.
 * Binds AnimationMixer + cross-fadable AnimationActions for 'idle', 'playing', 'sleep', and 'feeding'.
 */
export async function loadCompanionGltfModel(params: {
  species: PetSpecies;
  equippedAccessories: string[];
  customModelId?: string;
  shadowMapEnabled: boolean;
}): Promise<LoadedGltfCompanion> {
  const { species, equippedAccessories, customModelId, shadowMapEnabled } = params;

  let isCustomModel = false;
  let gltfBuffer: ArrayBuffer | null = null;

  if (customModelId) {
    gltfBuffer = await loadCustomPetModelBuffer(customModelId);
    if (gltfBuffer) {
      isCustomModel = true;
    }
  }

  if (!gltfBuffer) {
    gltfBuffer = await compileSpeciesToGlbBuffer(species, equippedAccessories);
    isCustomModel = false;
  }

  const gltf = await parseGltfBuffer(gltfBuffer);
  const modelRoot = gltf.scene;
  const wrapperGroup = new THREE.Group();
  wrapperGroup.name = isCustomModel ? 'CustomGltfWrapper' : `SpeciesGltfWrapper_${species}`;

  // Normalize scale and ground bottom-center onto pedestal for arbitrary custom GLTF/GLB assets
  if (isCustomModel) {
    modelRoot.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(modelRoot);
    if (!box.isEmpty()) {
      const norm = computeModelNormalizationTransform(
        box.min.x,
        box.min.y,
        box.min.z,
        box.max.x,
        box.max.y,
        box.max.z,
        1.22
      );
      modelRoot.scale.multiplyScalar(norm.scale);
      modelRoot.position.set(norm.offsetX, norm.offsetY, norm.offsetZ);
    }
  }

  const interactables: THREE.Object3D[] = [];
  modelRoot.traverse(child => {
    child.userData.interactAction = 'pet';
    const mesh = child as THREE.Mesh;
    if (mesh.isMesh) {
      mesh.castShadow = shadowMapEnabled;
      mesh.receiveShadow = shadowMapEnabled;
      mesh.layers.enable(1);
    }
  });
  interactables.push(modelRoot);
  wrapperGroup.add(modelRoot);

  // Locate named articulated pivots or common external rig bones for subtle gaze & blink overlay
  const headPivot = modelRoot.getObjectByName('headPivot') || null;
  const eyelidL = modelRoot.getObjectByName('eyelidL') || null;
  const eyelidR = modelRoot.getObjectByName('eyelidR') || null;
  const hasRiggedBuiltInNodes = !isCustomModel && Boolean(headPivot);

  let gazeBone: THREE.Object3D | null = headPivot;
  if (!gazeBone) {
    modelRoot.traverse(obj => {
      if (!gazeBone && /^(mixamorig:?head|head|neck|bip.*head)$/i.test(obj.name.trim())) {
        gazeBone = obj;
      }
    });
  }

  const baseHeadEuler = gazeBone ? gazeBone.rotation.clone() : new THREE.Euler();
  const gazeDrivenByClip = Boolean(
    gazeBone &&
      gazeBone.name &&
      gltf.animations.some(clip =>
        clip.tracks.some(track => track.name.split('.')[0] === gazeBone!.name)
      )
  );

  // Set up Three.js AnimationMixer & clip-to-activity bindings
  const mixer = new THREE.AnimationMixer(modelRoot);
  const clipNames = gltf.animations.map(c => c.name);
  const mapped = mapAllActivityClips(clipNames);
  const actions: Partial<
    Record<PetActivityState, { action: THREE.AnimationAction; timeScale: number }>
  > = {};

  (['idle', 'playing', 'sleep', 'feeding'] as const).forEach(act => {
    const res = mapped[act];
    if (!res.clipName) return;
    const clip = gltf.animations.find(c => c.name === res.clipName) || gltf.animations[0];
    if (!clip) return;
    const action = mixer.clipAction(clip);
    action.loop = THREE.LoopRepeat;
    action.enabled = true;
    actions[act] = { action, timeScale: res.timeScale };
  });

  return {
    wrapperGroup,
    modelRoot,
    mixer,
    actions,
    clipNames,
    currentActivity: null,
    currentAction: null,
    isCustomModel,
    hasRiggedBuiltInNodes,
    headPivot,
    gazeBone,
    gazeDrivenByClip,
    baseHeadEuler,
    eyelidL,
    eyelidR,
    interactables
  };
}

/**
 * Smoothly cross-fades the GLTF AnimationMixer to the clip matching the target PetActivityState.
 */
export function transitionGltfActivity(
  companion: LoadedGltfCompanion,
  activity: PetActivityState,
  fadeSeconds = 0.28
): void {
  if (companion.currentActivity === activity) return;
  companion.currentActivity = activity;

  const entry = companion.actions[activity];
  if (!entry) return;

  const nextAction = entry.action;
  nextAction.enabled = true;
  nextAction.setEffectiveTimeScale(entry.timeScale);
  nextAction.setEffectiveWeight(1);

  if (companion.currentAction && companion.currentAction !== nextAction) {
    if (nextAction.getClip() === companion.currentAction.getClip()) {
      // Same underlying clip reused for another state (custom single-clip GLB): adjust speed smoothly
      nextAction.setEffectiveTimeScale(entry.timeScale);
    } else {
      nextAction.reset().play();
      companion.currentAction.crossFadeTo(nextAction, fadeSeconds, true);
    }
  } else {
    nextAction.reset().fadeIn(0.18).play();
  }

  companion.currentAction = nextAction;
}
