// Three.js stage for the companion: procedural glTF model with animation
// clips, gaze tracking, blinking, clickable props (bowl, toy, bed) and orbit
// camera. Falls back to a plain card when WebGL is unavailable.
import { Show, createEffect, createSignal, on, onCleanup, onMount } from "solid-js";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { computeEyeBlinkFactor, solvePet3DPose, type Pet3DInteractAction, type Pet3DRigPose } from "../../core/pet3dKinematics";
import type { PetActivityState, PetSpecies } from "../../core/types";
import { applyPoseToStageProps, buildPetStageProps, detectSoftwareWebGL, disposeThreeObjectTree, type PetStageWorldHandles } from "../../core/three/pet3dBuilder";
import { loadCompanionGltfModel, transitionGltfActivity, type LoadedGltfCompanion } from "../../core/three/petGltfLoader";
import { settings } from "../../state/settings";

type Variant = "mini" | "card" | "studio";
const CAMERA: Record<Variant, { pos: [number, number, number]; target: [number, number, number]; fov: number }> = {
  mini: { pos: [0.22, 1.12, 2.05], target: [0, 0.78, 0.04], fov: 35 },
  card: { pos: [0.35, 1.38, 3.35], target: [0, 0.58, 0], fov: 37 },
  studio: { pos: [0.42, 1.48, 3.45], target: [0, 0.58, 0], fov: 38 },
};

function damp(prev: Pet3DRigPose | null, target: Pet3DRigPose, dt: number): Pet3DRigPose {
  if (!prev) return target;
  const d = (a: number, b: number) => THREE.MathUtils.damp(a, b, 9.5, dt);
  return { ...target, bodyPosX: d(prev.bodyPosX, target.bodyPosX), bodyPosY: d(prev.bodyPosY, target.bodyPosY), bodyPosZ: d(prev.bodyPosZ, target.bodyPosZ), bodyRotX: d(prev.bodyRotX, target.bodyRotX), bodyRotY: d(prev.bodyRotY, target.bodyRotY), bodyRotZ: d(prev.bodyRotZ, target.bodyRotZ), toyPosX: d(prev.toyPosX, target.toyPosX), toyPosY: d(prev.toyPosY, target.toyPosY), toyPosZ: d(prev.toyPosZ, target.toyPosZ), bowlSpin: d(prev.bowlSpin, target.bowlSpin), moonGlow: d(prev.moonGlow, target.moonGlow) };
}

export function PetViewport(props: { species: PetSpecies; activity: PetActivityState; accessories: string[]; customModelId?: string; variant?: Variant; label: string; onAction?: (a: Pet3DInteractAction) => void }) {
  let mount!: HTMLDivElement;
  const [failed, setFailed] = createSignal(false);
  const [ready, setReady] = createSignal(false);
  const variant = () => props.variant ?? "studio";
  const interactive = () => variant() !== "mini";
  let scene: THREE.Scene | null = null;
  let stage: PetStageWorldHandles | null = null, gltf: LoadedGltfCompanion | null = null;
  let interactables: THREE.Object3D[] = [];
  let pose: Pet3DRigPose | null = null;
  const pointer = { x: 0, y: 0 }, dpointer = { x: 0, y: 0 };
  let burst: { at: number; kind: Pet3DInteractAction | null } = { at: -10, kind: null };
  let elapsed = 0, softGl = true, loadSeq = 0;

  const buildModel = () => {
    if (!scene) return;
    const seq = ++loadSeq;
    const mini = variant() === "mini";
    if (stage) { scene.remove(stage.stageRoot); disposeThreeObjectTree(stage.stageRoot); }
    stage = buildPetStageProps(props.species, [...props.accessories], { includeProps: !mini, includePedestal: !mini, shadowMapEnabled: !softGl && !mini });
    scene.add(stage.stageRoot);
    pose = null;
    interactables = [...stage.interactables];
    setReady(false);
    void loadCompanionGltfModel({ species: props.species, equippedAccessories: [...props.accessories], customModelId: props.customModelId, shadowMapEnabled: !softGl && !mini }).then((c) => {
      if (seq !== loadSeq || !scene) { c.mixer.stopAllAction(); disposeThreeObjectTree(c.wrapperGroup); return; }
      if (gltf) { gltf.mixer.stopAllAction(); scene.remove(gltf.wrapperGroup); disposeThreeObjectTree(gltf.wrapperGroup); }
      scene.add(c.wrapperGroup);
      gltf = c;
      interactables = [...(stage?.interactables ?? []), ...c.interactables];
      transitionGltfActivity(c, props.activity, 0.08);
      c.mixer.update(0.016);
      setReady(true);
    }).catch(() => undefined);
  };

  onMount(() => {
    softGl = detectSoftwareWebGL();
    const mini = variant() === "mini";
    let r: THREE.WebGLRenderer;
    try {
      r = new THREE.WebGLRenderer({ antialias: !softGl, alpha: true, preserveDrawingBuffer: softGl, powerPreference: "high-performance" });
    } catch { setFailed(true); return; }
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = 1.14;
    r.setPixelRatio(softGl ? 1 : Math.min(devicePixelRatio || 1, 2));
    r.shadowMap.enabled = !softGl && !mini;
    r.shadowMap.type = THREE.PCFSoftShadowMap;
    r.setClearColor(0x000000, 0);
    r.setSize(Math.max(mount.clientWidth || 120, 48), Math.max(mount.clientHeight || 120, 48));
    r.domElement.style.cssText = `display:block;width:100%;height:100%;touch-action:${interactive() ? "none" : "auto"}`;
    mount.append(r.domElement);
    const sc = new THREE.Scene();
    scene = sc;
    const pmrem = new THREE.PMREMGenerator(r);
    const env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    sc.environment = env;
    pmrem.dispose();
    const key = new THREE.DirectionalLight(0xfff7ed, 2.0);
    key.position.set(2.8, 4.5, 3.2);
    if (!softGl && !mini) { key.castShadow = true; key.shadow.mapSize.set(512, 512); Object.assign(key.shadow.camera, { near: 0.5, far: 12, left: -2.2, right: 2.2, top: 2.2, bottom: -2.2 }); key.shadow.bias = -0.0005; key.shadow.normalBias = 0.02; }
    const rim = new THREE.DirectionalLight(0x60a5fa, 0.95);
    rim.position.set(-2.6, 2.2, -2.8);
    sc.add(new THREE.HemisphereLight(0xdbeafe, 0x1e293b, 0.9), key, rim);
    const cfg = CAMERA[variant()];
    const cam = new THREE.PerspectiveCamera(cfg.fov, r.domElement.clientWidth / Math.max(1, r.domElement.clientHeight), 0.1, 30);
    cam.position.set(...cfg.pos);
    cam.lookAt(...cfg.target);
    let controls: OrbitControls | null = null;
    if (interactive()) {
      controls = new OrbitControls(cam, r.domElement);
      controls.target.set(...cfg.target);
      Object.assign(controls, { enablePan: false, enableDamping: !softGl, dampingFactor: 0.07, minDistance: 2.1, maxDistance: 5.4, minPolarAngle: 0.35, maxPolarAngle: Math.PI * 0.48 });
      controls.update();
    }
    buildModel();

    const ray = new THREE.Raycaster();
    ray.layers.set(1);
    const ndc = new THREE.Vector2();
    let downX = 0, downY = 0;
    const toNdc = (e: PointerEvent) => {
      const rect = r.domElement.getBoundingClientRect();
      if (!rect.width) return;
      ndc.set(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
      pointer.x = THREE.MathUtils.clamp(ndc.x, -1, 1);
      pointer.y = THREE.MathUtils.clamp(ndc.y, -1, 1);
    };
    const down = (e: PointerEvent) => { downX = e.clientX; downY = e.clientY; toNdc(e); };
    const up = (e: PointerEvent) => {
      if (!interactive() || Math.hypot(e.clientX - downX, e.clientY - downY) > 8) return;
      toNdc(e);
      ray.setFromCamera(ndc, cam);
      const action = ray.intersectObjects(interactables, true)[0]?.object.userData.interactAction as Pet3DInteractAction | undefined;
      if (action) { burst = { at: elapsed, kind: action }; props.onAction?.(action); }
    };
    const leave = () => { pointer.x = 0; pointer.y = 0; };
    const lost = (e: Event) => e.preventDefault();
    r.domElement.addEventListener("pointerdown", down);
    r.domElement.addEventListener("pointermove", toNdc);
    r.domElement.addEventListener("pointerup", up);
    r.domElement.addEventListener("pointerleave", leave);
    r.domElement.addEventListener("webglcontextlost", lost);
    const ro = new ResizeObserver(([entry]) => {
      if (!entry) return;
      const w = Math.max(Math.round(entry.contentRect.width), 32), h = Math.max(Math.round(entry.contentRect.height), 32);
      cam.aspect = w / h;
      cam.updateProjectionMatrix();
      r.setSize(w, h);
    });
    ro.observe(mount);

    let disposed = false, frame = 0, last = performance.now();
    const still = () => settings.accessibility.reduceMotion;
    const tick = () => {
      if (disposed) return;
      const now = performance.now();
      const dt = Math.min(Math.max((now - last) / 1000, 0.001), 0.1);
      last = now;
      elapsed += still() ? 0 : dt;
      dpointer.x = THREE.MathUtils.damp(dpointer.x, pointer.x, 8.5, dt);
      dpointer.y = THREE.MathUtils.damp(dpointer.y, pointer.y, 8.5, dt);
      const bt = elapsed - burst.at;
      pose = damp(pose, solvePet3DPose({ species: props.species, activity: props.activity, elapsed, pointerX: dpointer.x, pointerY: dpointer.y, burstTime: bt, burstKind: burst.kind }), dt);
      if (stage) applyPoseToStageProps(stage, pose);
      const c = gltf;
      if (c) {
        if (!still()) c.mixer.update(dt);
        const inBurst = burst.kind !== null && bt >= 0 && bt < 1.35;
        const p = inBurst ? bt / 1.35 : 0;
        const hop = inBurst ? Math.sin(p * Math.PI) * 0.22 : 0;
        const spin = inBurst && burst.kind === "pet" ? Math.sin(p * Math.PI * 2) * 0.42 : 0;
        if (c.isCustomModel && c.clipNames.length === 0) {
          c.wrapperGroup.position.set(pose.bodyPosX, hop + Math.max(0, pose.bodyPosY), pose.bodyPosZ);
          c.wrapperGroup.rotation.set(pose.bodyRotX * 0.65, pose.bodyRotY + spin, pose.bodyRotZ * 0.65);
          c.wrapperGroup.scale.set(pose.bodyScaleX, pose.bodyScaleY, pose.bodyScaleZ);
        } else {
          c.wrapperGroup.position.set(0, hop, 0);
          c.wrapperGroup.rotation.set(0, spin, 0);
        }
        if (c.gazeBone) {
          if (c.gazeDrivenByClip && c.currentAction) { c.gazeBone.rotation.y += dpointer.x * 0.22; c.gazeBone.rotation.x += -dpointer.y * 0.12; }
          else c.gazeBone.rotation.set(c.baseHeadEuler.x - dpointer.y * 0.16, c.baseHeadEuler.y + dpointer.x * 0.3, c.baseHeadEuler.z);
        }
        if (c.eyelidL && c.eyelidR && props.activity !== "sleep") {
          const blink = computeEyeBlinkFactor(elapsed);
          if (blink > 0.02) { const a = THREE.MathUtils.lerp(-1.48, 0.08, blink); c.eyelidL.rotation.x = a; c.eyelidR.rotation.x = a; }
        }
      }
      controls?.update();
      r.render(sc, cam);
      if (softGl) frame = window.setTimeout(tick, 80);
      else frame = requestAnimationFrame(tick);
    };
    tick();

    onCleanup(() => {
      disposed = true;
      loadSeq++;
      cancelAnimationFrame(frame);
      clearTimeout(frame);
      ro.disconnect();
      controls?.dispose();
      if (gltf) { gltf.mixer.stopAllAction(); sc.remove(gltf.wrapperGroup); disposeThreeObjectTree(gltf.wrapperGroup); gltf = null; }
      if (stage) { sc.remove(stage.stageRoot); disposeThreeObjectTree(stage.stageRoot); stage = null; }
      env.dispose();
      r.dispose();
      r.domElement.remove();
      scene = null;
    });
  });

  createEffect(on(() => [props.species, props.accessories.join("|"), props.customModelId], () => buildModel(), { defer: true }));
  createEffect(on(() => props.activity, (a) => {
    burst = { at: elapsed, kind: a === "playing" ? "play" : a === "feeding" ? "eat" : a === "sleep" ? "sleep" : "pet" };
    if (gltf) transitionGltfActivity(gltf, a, 0.3);
  }, { defer: true }));

  return (
    <div class="pet-viewport" role="img" aria-label={props.label} data-ready={ready()}>
      <Show when={!failed()} fallback={<div class="pet-fallback">🦊</div>}><div ref={mount} class="pet-mount" /></Show>
    </div>
  );
}
