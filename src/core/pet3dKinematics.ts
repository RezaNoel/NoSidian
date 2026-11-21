import type { PetActivityState, PetSpecies } from './types';

export type Pet3DInteractAction = 'pet' | 'play' | 'sleep' | 'eat';

export interface Pet3DPoseInput {
  species: PetSpecies;
  activity: PetActivityState;
  elapsed: number;
  pointerX: number; // normalized [-1, 1]
  pointerY: number; // normalized [-1, 1]
  burstTime: number; // seconds since last burst (<= 1.4s active)
  burstKind: Pet3DInteractAction | null;
}

export interface Pet3DRigPose {
  // Root / body locomotion (radians & local units)
  bodyPosX: number;
  bodyPosY: number;
  bodyPosZ: number;
  bodyRotX: number;
  bodyRotY: number;
  bodyRotZ: number;
  bodyScaleX: number;
  bodyScaleY: number;
  bodyScaleZ: number;
  // Head tracking & expression
  headRotX: number;
  headRotY: number;
  headRotZ: number;
  earRotZ: number;
  mouthOpen: number; // 0..1
  eyelidClosed: number; // 0..1
  // Appendages
  tailRotY: number;
  tailRotX: number;
  wingAngle: number;
  pawSwingFL: number;
  pawSwingFR: number;
  pawSwingBL: number;
  pawSwingBR: number;
  // Interactive world props
  toyPosX: number;
  toyPosY: number;
  toyPosZ: number;
  toyRotX: number;
  toyRotZ: number;
  bowlSpin: number;
  moonGlow: number;
  lanternOrbitAngle: number;
  lanternBobY: number;
  // Particles
  zzzVisible: boolean;
  zzzProgress: number;
  particleBurstProgress: number; // 0..1 when bursting, 0 when idle
}

const clamp = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v);

/**
 * Deterministic periodic blink curve with occasional double-blinks.
 * Returns eyelid closure [0 = open, 1 = closed].
 */
export function computeEyeBlinkFactor(elapsed: number): number {
  const cycle = ((elapsed % 4.2) + 4.2) % 4.2;
  if (cycle > 3.85 && cycle < 4.04) {
    const u = (cycle - 3.85) / 0.19;
    return Math.sin(u * Math.PI);
  }
  if (cycle > 1.72 && cycle < 1.88) {
    const u = (cycle - 1.72) / 0.16;
    return Math.sin(u * Math.PI) * 0.9;
  }
  return 0;
}

/**
 * Computes full articulated 3D pose for the companion rig & scene props.
 */
export function solvePet3DPose(input: Pet3DPoseInput): Pet3DRigPose {
  const { species, activity, elapsed, pointerX, pointerY, burstTime, burstKind } = input;
  const px = clamp(pointerX, -1, 1);
  const py = clamp(pointerY, -1, 1);

  const inBurst = burstKind !== null && burstTime >= 0 && burstTime < 1.35;
  const burstProgress = inBurst ? clamp(burstTime / 1.35, 0, 1) : 0;
  const burstHop = inBurst ? Math.sin(burstProgress * Math.PI) * 0.24 : 0;
  const burstSpin = inBurst && burstKind === 'pet' ? Math.sin(burstProgress * Math.PI * 2) * 0.42 : 0;

  // Base breathing curve
  const breathRate = activity === 'sleep' ? 1.55 : activity === 'playing' ? 4.4 : 2.3;
  const breathAmp = activity === 'sleep' ? 0.045 : 0.025;
  const breath = Math.sin(elapsed * breathRate);

  let bodyPosX = 0;
  let bodyPosY = burstHop;
  let bodyPosZ = 0;
  let bodyRotX = 0;
  let bodyRotY = burstSpin;
  let bodyRotZ = 0;
  let bodyScaleX = 1 + breath * breathAmp * 0.6;
  let bodyScaleY = 1 - breath * breathAmp * 0.5;
  let bodyScaleZ = 1 + breath * breathAmp * 0.6;

  let headRotX = -py * 0.18 + Math.sin(elapsed * 1.4) * 0.04;
  let headRotY = px * 0.36 + Math.sin(elapsed * 0.85) * 0.07;
  let headRotZ = -px * 0.09;
  let earRotZ = Math.sin(elapsed * 2.1) * 0.05;
  let mouthOpen = 0.04;
  let eyelidClosed = computeEyeBlinkFactor(elapsed);

  let tailRotY = Math.sin(elapsed * 3.1) * 0.34;
  let tailRotX = 0.22 + Math.sin(elapsed * 1.9) * 0.08;
  let wingAngle = species === 'owl' ? 0.12 + Math.sin(elapsed * 2.4) * 0.06 : 0;

  let pawSwingFL = Math.sin(elapsed * 1.8) * 0.05;
  let pawSwingFR = -Math.sin(elapsed * 1.8) * 0.05;
  let pawSwingBL = 0;
  let pawSwingBR = 0;

  // Interactive prop animations
  let toyPosX = 0.92;
  let toyPosY = 0.16;
  let toyPosZ = 0.55;
  let toyRotX = 0;
  let toyRotZ = 0;
  let bowlSpin = 0;
  let moonGlow = 0.45;

  if (activity === 'playing') {
    // Cheerful figure-8 bounce chasing the 3D toy ball!
    const bounce = Math.abs(Math.sin(elapsed * 5.2));
    bodyPosX = Math.sin(elapsed * 2.2) * 0.28;
    bodyPosZ = Math.sin(elapsed * 4.4) * 0.12;
    bodyPosY += bounce * 0.28;
    bodyRotY += Math.sin(elapsed * 2.2) * 0.42;
    bodyRotZ = Math.cos(elapsed * 2.2) * 0.08;
    bodyRotX = (0.5 - bounce) * 0.16;
    bodyScaleY = 0.94 + bounce * 0.12;
    bodyScaleX = 1.04 - bounce * 0.05;
    bodyScaleZ = bodyScaleX;

    headRotY = px * 0.22 + Math.cos(elapsed * 2.2) * 0.35;
    headRotX = -0.14 + Math.sin(elapsed * 5.2) * 0.14;
    earRotZ = Math.sin(elapsed * 6.5) * 0.16;
    mouthOpen = 0.55 + Math.sin(elapsed * 7.0) * 0.25;
    tailRotY = Math.sin(elapsed * 9.0) * 0.68;
    tailRotX = 0.42;
    wingAngle = species === 'owl' ? 0.45 + Math.sin(elapsed * 8.5) * 0.52 : 0.24;

    pawSwingFL = Math.sin(elapsed * 6.2) * 0.55;
    pawSwingFR = -Math.sin(elapsed * 6.2) * 0.55;
    pawSwingBL = -Math.sin(elapsed * 6.2) * 0.4;
    pawSwingBR = Math.sin(elapsed * 6.2) * 0.4;

    // Bouncing orbiting 3D ball
    toyPosX = Math.cos(elapsed * 2.6) * 0.78;
    toyPosZ = 0.52 + Math.sin(elapsed * 2.6) * 0.28;
    toyPosY = 0.16 + Math.abs(Math.sin(elapsed * 4.8)) * 0.52;
    toyRotX = elapsed * 4.5;
    toyRotZ = elapsed * 3.1;
  } else if (activity === 'sleep') {
    // Turn cozy toward cushion on the left, curl low, eyes closed, gentle breathing
    bodyPosX = -0.26;
    bodyPosY = -0.07 + burstHop * 0.35;
    bodyPosZ = -0.04;
    bodyRotY = -0.34;
    bodyRotX = 0.1;
    bodyRotZ = 0.05;
    bodyScaleX = 1.07 + breath * 0.035;
    bodyScaleY = 0.87 - breath * 0.028;
    bodyScaleZ = 1.05 + breath * 0.035;

    headRotX = 0.24 + Math.sin(elapsed * 1.55) * 0.04;
    headRotY = -0.14;
    headRotZ = 0.15;
    earRotZ = -0.14;
    mouthOpen = 0.08 + Math.max(0, Math.sin(elapsed * 1.55)) * 0.1;
    eyelidClosed = 1;

    tailRotY = -0.55 + Math.sin(elapsed * 1.1) * 0.06;
    tailRotX = -0.12;
    wingAngle = species === 'owl' ? -0.08 : 0;

    pawSwingFL = 0.38;
    pawSwingFR = 0.38;
    pawSwingBL = -0.35;
    pawSwingBR = -0.35;
    moonGlow = 1.15 + Math.sin(elapsed * 2.0) * 0.25;
  } else if (activity === 'feeding') {
    // Step toward front-left bowl, rhythmic head dip & happy chew!
    const chewPhase = Math.sin(elapsed * 8.2);
    const dipPhase = Math.max(0, Math.sin(elapsed * 3.2));
    bodyPosX = -0.22;
    bodyPosZ = 0.18;
    bodyPosY += dipPhase * 0.03;
    bodyRotY = -0.45;
    bodyRotX = 0.18 + dipPhase * 0.16;

    headRotX = 0.32 + dipPhase * 0.28;
    headRotY = -0.12 + px * 0.1;
    headRotZ = chewPhase * 0.05;
    earRotZ = Math.sin(elapsed * 6.0) * 0.12;
    mouthOpen = 0.25 + (chewPhase * 0.5 + 0.5) * 0.55;
    eyelidClosed = Math.max(computeEyeBlinkFactor(elapsed), 0.22); // happy squint

    tailRotY = Math.sin(elapsed * 6.8) * 0.52;
    tailRotX = 0.3;
    wingAngle = species === 'owl' ? 0.22 + Math.sin(elapsed * 5.0) * 0.14 : 0;

    pawSwingFL = 0.2;
    pawSwingFR = -0.15;
    bowlSpin = Math.sin(elapsed * 2.4) * 0.12;
  } else {
    // Idle living micro-behaviors (gentle weight shift, ear twitch, curious head tilt)
    bodyPosY += Math.sin(elapsed * 2.3) * 0.02;
    bodyRotZ = Math.sin(elapsed * 1.15) * 0.03;
    if (species === 'owl') {
      // Owls hover-perch slightly with tiny feather shifts
      headRotZ += Math.sin(elapsed * 0.9) * 0.08;
    }
  }

  return {
    bodyPosX,
    bodyPosY,
    bodyPosZ,
    bodyRotX,
    bodyRotY,
    bodyRotZ,
    bodyScaleX,
    bodyScaleY,
    bodyScaleZ,
    headRotX,
    headRotY,
    headRotZ,
    earRotZ,
    mouthOpen,
    eyelidClosed,
    tailRotY,
    tailRotX,
    wingAngle,
    pawSwingFL,
    pawSwingFR,
    pawSwingBL,
    pawSwingBR,
    toyPosX,
    toyPosY,
    toyPosZ,
    toyRotX,
    toyRotZ,
    bowlSpin,
    moonGlow,
    lanternOrbitAngle: elapsed * 0.95,
    lanternBobY: 0.78 + Math.sin(elapsed * 2.2) * 0.09,
    zzzVisible: activity === 'sleep',
    zzzProgress: ((elapsed * 0.45) % 1 + 1) % 1,
    particleBurstProgress: inBurst ? burstProgress : 0
  };
}

/**
 * Resolves clicking on a 3D prop or the 3D pet itself into the next activity mode.
 */
export function resolvePropClickAction(
  action: Pet3DInteractAction,
  currentActivity: PetActivityState
): PetActivityState {
  if (action === 'play') return 'playing';
  if (action === 'sleep') return currentActivity === 'sleep' ? 'idle' : 'sleep';
  if (action === 'eat') return 'feeding';
  // Clicking the pet directly wakes it gently or celebrates with play!
  if (currentActivity === 'sleep') return 'idle';
  return 'playing';
}
