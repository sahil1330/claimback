import { describe, expect, it } from "vitest";
import { audioLevel, initialVoiceActivity, observeVoice } from "./voice-activity";

describe("voice pause detection", () => {
  it("waits for speech and does not submit a quiet start", () => {
    let activity = initialVoiceActivity();
    for (let time = 0; time <= 4_000; time += 50) {
      const result = observeVoice(activity, 0.003, time);
      activity = result.activity;
      expect(result.shouldStop).toBe(false);
    }
  });

  it("stops after 1.5 seconds of quiet following speech", () => {
    let activity = initialVoiceActivity();
    activity = observeVoice(activity, 0.07, 100).activity;
    activity = observeVoice(activity, 0.06, 150).activity;
    expect(observeVoice(activity, 0.003, 1_600).shouldStop).toBe(false);
    expect(observeVoice(activity, 0.003, 1_650).shouldStop).toBe(true);
  });

  it("resets the pause when speaking resumes", () => {
    let activity = initialVoiceActivity();
    activity = observeVoice(activity, 0.07, 100).activity;
    activity = observeVoice(activity, 0.07, 150).activity;
    activity = observeVoice(activity, 0.002, 1_000).activity;
    activity = observeVoice(activity, 0.05, 1_100).activity;
    expect(observeVoice(activity, 0.002, 2_550).shouldStop).toBe(false);
    expect(observeVoice(activity, 0.002, 2_600).shouldStop).toBe(true);
  });

  it("ignores a single noise spike", () => {
    const activity = observeVoice(initialVoiceActivity(), 0.09, 100).activity;
    expect(observeVoice(activity, 0.002, 2_000).shouldStop).toBe(false);
  });

  it("measures microphone level from samples", () => {
    expect(audioLevel(new Float32Array([0, 0, 0, 0]))).toBe(0);
    expect(audioLevel(new Float32Array([0.5, -0.5]))).toBe(0.5);
  });
});
