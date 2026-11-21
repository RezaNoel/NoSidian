import type { PetActivityState } from './types';

export interface GltfClipResolution {
  clipName: string | null;
  timeScale: number;
}

export interface ModelNormalizationTransform {
  scale: number;
  offsetX: number;
  offsetY: number;
  offsetZ: number;
}

const EXACT_PATTERNS: Record<PetActivityState, RegExp[]> = {
  idle: [/^(idle|stand|breath(ing)?|wait|default|loop)$/i, /idle|breath|stand/i],
  playing: [
    /^(play(ing)?|jump|run|walk|happy|dance|spin|hop|excited)$/i,
    /play|jump|run|walk|happy|dance|hop/i
  ],
  sleep: [/^(sleep(ing)?|nap|rest|sit|lie|curl|slumber|doze)$/i, /sleep|nap|rest|sit|lie|curl/i],
  feeding: [/^(feed(ing)?|eat(ing)?|chew|bite|snack|peck|nibble)$/i, /feed|eat|chew|bite|snack/i]
};

const ACTIVITY_SPEEDS: Record<PetActivityState, number> = {
  idle: 1.0,
  playing: 1.25,
  sleep: 0.6,
  feeding: 1.15
};

/**
 * Maps an arbitrary GLTF/GLB model's animation clip list to one of the 4 pet activities
 * ('idle', 'playing', 'sleep', 'feeding') with deterministic fallback when clips have generic names.
 */
export function resolveClipForActivity(
  clipNames: string[],
  activity: PetActivityState
): GltfClipResolution {
  if (!clipNames || clipNames.length === 0) {
    return { clipName: null, timeScale: ACTIVITY_SPEEDS[activity] };
  }

  for (const rx of EXACT_PATTERNS[activity]) {
    const match = clipNames.find(name => rx.test(name.trim()));
    if (match) {
      return { clipName: match, timeScale: 1.0 };
    }
  }

  // Fallback: try finding an idle clip so model keeps breathing/moving smoothly, or index-based fallback
  const idleFallback = clipNames.find(n => /idle|breath|stand/i.test(n));
  if (idleFallback) {
    return { clipName: idleFallback, timeScale: ACTIVITY_SPEEDS[activity] };
  }

  const orderIndex: Record<PetActivityState, number> = {
    idle: 0,
    playing: Math.min(1, clipNames.length - 1),
    sleep: Math.min(2, clipNames.length - 1),
    feeding: Math.min(3, clipNames.length - 1)
  };
  return {
    clipName: clipNames[orderIndex[activity]] ?? clipNames[0],
    timeScale: ACTIVITY_SPEEDS[activity]
  };
}

/**
 * Resolves all 4 PetActivityState mappings for UI telemetry & AnimationMixer caching.
 */
export function mapAllActivityClips(
  clipNames: string[]
): Record<PetActivityState, GltfClipResolution> {
  return {
    idle: resolveClipForActivity(clipNames, 'idle'),
    playing: resolveClipForActivity(clipNames, 'playing'),
    sleep: resolveClipForActivity(clipNames, 'sleep'),
    feeding: resolveClipForActivity(clipNames, 'feeding')
  };
}

/**
 * Computes uniform scale and bottom-center offset so any arbitrary GLB/GLTF mesh
 * stands flush on the companion stage pedestal (Y = 0, centered at X=0, Z=0).
 */
export function computeModelNormalizationTransform(
  minX: number,
  minY: number,
  minZ: number,
  maxX: number,
  maxY: number,
  maxZ: number,
  targetHeight = 1.18
): ModelNormalizationTransform {
  const sizeX = Math.max(0.0001, maxX - minX);
  const sizeY = Math.max(0.0001, maxY - minY);
  const sizeZ = Math.max(0.0001, maxZ - minZ);
  const dominant = Math.max(sizeX, sizeY, sizeZ);
  const scale = targetHeight / dominant;
  const centerX = (minX + maxX) * 0.5;
  const centerZ = (minZ + maxZ) * 0.5;
  return {
    scale,
    offsetX: -centerX * scale,
    offsetY: -minY * scale,
    offsetZ: -centerZ * scale
  };
}

export function validateGltfFileName(fileName: string): boolean {
  return /\.(glb|gltf)$/i.test(fileName.trim());
}

export function stripModelExtension(fileName: string): string {
  return fileName.trim().replace(/\.(glb|gltf)$/i, '') || 'Custom 3D Pet';
}
