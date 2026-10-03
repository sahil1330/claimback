export const VOICE_SILENCE_MS = 1_500;

const MIN_VOICE_LEVEL = 0.012;
const MIN_VOICE_FRAMES = 2;

export type VoiceActivity = {
  consecutiveVoiceFrames: number;
  heardSpeech: boolean;
  lastVoiceAt: number | null;
  noiseFloor: number;
};

export function initialVoiceActivity(): VoiceActivity {
  return { consecutiveVoiceFrames: 0, heardSpeech: false, lastVoiceAt: null, noiseFloor: 0.004 };
}

/** Only a pause after sustained speech ends a recording. */
export function observeVoice(activity: VoiceActivity, level: number, now: number) {
  const threshold = Math.max(MIN_VOICE_LEVEL, activity.noiseFloor * 2.5);
  if (level >= threshold) {
    const consecutiveVoiceFrames = activity.consecutiveVoiceFrames + 1;
    return {
      activity: {
        ...activity,
        consecutiveVoiceFrames,
        heardSpeech: activity.heardSpeech || consecutiveVoiceFrames >= MIN_VOICE_FRAMES,
        lastVoiceAt: now,
      },
      shouldStop: false,
    };
  }

  const next = {
    ...activity,
    consecutiveVoiceFrames: 0,
    noiseFloor: activity.heardSpeech ? activity.noiseFloor : activity.noiseFloor * 0.95 + level * 0.05,
  };
  return {
    activity: next,
    shouldStop: next.heardSpeech && next.lastVoiceAt !== null && now - next.lastVoiceAt >= VOICE_SILENCE_MS,
  };
}

export function audioLevel(samples: Float32Array) {
  let power = 0;
  for (const sample of samples) power += sample * sample;
  return Math.sqrt(power / samples.length);
}
