import { SOUNDS, type SoundName } from "@/data/assets";

const cache: Partial<Record<SoundName, HTMLAudioElement>> = {};

const VOLUMES: Record<SoundName, number> = {
  unlock: 0.7,
  click: 0.55,
  correct: 0.5,
  wrong: 0.45,
};

/** Plays a short UI sound. Failures (autoplay policy, network) are silently ignored. */
export function playSound(name: SoundName): void {
  try {
    let audio = cache[name];
    if (!audio) {
      audio = new Audio(SOUNDS[name]);
      audio.preload = "auto";
      cache[name] = audio;
    }
    audio.volume = VOLUMES[name];
    audio.currentTime = 0;
    void audio.play().catch(() => undefined);
  } catch {
    // Audio is a nice-to-have; never block gameplay.
  }
}

export function preloadSounds(): void {
  (Object.keys(SOUNDS) as SoundName[]).forEach((name) => {
    if (!cache[name]) {
      const audio = new Audio(SOUNDS[name]);
      audio.preload = "auto";
      cache[name] = audio;
    }
  });
}
