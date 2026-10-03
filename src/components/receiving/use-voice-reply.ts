"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { z } from "zod";

const supportedLanguages = [
  "en-IN", "hi-IN", "bn-IN", "ta-IN", "te-IN", "kn-IN",
  "ml-IN", "mr-IN", "gu-IN", "pa-IN", "od-IN",
] as const;

const languageSchema = z.enum(supportedLanguages);
const speechResponseSchema = z.object({
  audioBase64: z.base64().min(1),
  mimeType: z.literal("audio/wav"),
  source: z.literal("sarvam"),
});
const speechErrorSchema = z.object({ error: z.string().min(1) });

export type VoiceReplyStatus = "idle" | "generating" | "playing" | "ready" | "unavailable";

function speechLanguage(detectedLanguage: string | null | undefined): typeof supportedLanguages[number] {
  const parsed = languageSchema.safeParse(detectedLanguage);
  return parsed.success ? parsed.data : "en-IN";
}

function speechText(reply: string): string {
  const plainText = reply
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/https?:\/\/\S+/g, "link")
    .replace(/[*_#>`]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (plainText.length <= 1_500) return plainText;
  const prefix = plainText.slice(0, 1_465);
  const lastSpace = prefix.lastIndexOf(" ");
  return `${prefix.slice(0, lastSpace > 1_200 ? lastSpace : prefix.length)}. Read the rest on screen.`;
}

function audioUrl(base64: string, mimeType: string): string {
  const binary = atob(base64);
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  return URL.createObjectURL(new Blob([bytes], { type: mimeType }));
}

/** Plays one Sarvam reply for a voice-origin chat turn. The visible text remains the fallback. */
export function useVoiceReply() {
  const [status, setStatus] = useState<VoiceReplyStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [hasAudio, setHasAudio] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioUrlRef = useRef<string | null>(null);
  const requestRef = useRef<AbortController | null>(null);
  const generationRef = useRef(0);
  const lastRequestedRef = useRef<string | null>(null);
  const mountedRef = useRef(false);

  const releaseAudio = useCallback(() => {
    const audio = audioRef.current;
    if (audio) {
      audio.onended = null;
      audio.onerror = null;
      audio.pause();
      audioRef.current = null;
    }
    if (audioUrlRef.current) {
      URL.revokeObjectURL(audioUrlRef.current);
      audioUrlRef.current = null;
    }
  }, []);

  const stop = useCallback(() => {
    generationRef.current += 1;
    requestRef.current?.abort();
    requestRef.current = null;
    lastRequestedRef.current = null;
    releaseAudio();
    if (mountedRef.current) {
      setHasAudio(false);
      setStatus("idle");
      setError(null);
    }
  }, [releaseAudio]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      generationRef.current += 1;
      requestRef.current?.abort();
      releaseAudio();
    };
  }, [releaseAudio]);

  const replay = useCallback(async () => {
    const audio = audioRef.current;
    if (!audio) return;
    try {
      audio.currentTime = 0;
      await audio.play();
      if (mountedRef.current) {
        setStatus("playing");
        setError(null);
      }
    } catch {
      if (mountedRef.current) {
        setStatus("ready");
        setError("Audio could not play here. The reply is still available as text.");
      }
    }
  }, []);

  const speak = useCallback(async (reply: string, detectedLanguage?: string | null, translateFromEnglish = false) => {
    const text = speechText(reply);
    if (!text) return;
    const languageCode = speechLanguage(detectedLanguage);
    const requestKey = `${languageCode}\u0000${translateFromEnglish}\u0000${text}`;
    if (lastRequestedRef.current === requestKey) return;
    lastRequestedRef.current = requestKey;

    const generation = ++generationRef.current;
    requestRef.current?.abort();
    releaseAudio();
    setHasAudio(false);
    setError(null);
    setStatus("generating");
    const controller = new AbortController();
    requestRef.current = controller;

    try {
      const response = await fetch("/api/voice/speak", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, languageCode, translateFromEnglish }),
        signal: controller.signal,
      });
      const body: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        const failure = speechErrorSchema.safeParse(body);
        throw new Error(failure.success ? failure.data.error : "Voice is temporarily unavailable.");
      }
      const parsed = speechResponseSchema.safeParse(body);
      if (!parsed.success) throw new Error("Voice returned audio that could not be read.");
      if (!mountedRef.current || generation !== generationRef.current) return;

      const url = audioUrl(parsed.data.audioBase64, parsed.data.mimeType);
      const audio = new Audio(url);
      audioUrlRef.current = url;
      audioRef.current = audio;
      audio.onended = () => {
        if (mountedRef.current && generation === generationRef.current) setStatus("ready");
      };
      audio.onerror = () => {
        if (mountedRef.current && generation === generationRef.current) {
          setStatus("unavailable");
          setError("Audio could not play here. The reply is still available as text.");
        }
      };
      setHasAudio(true);
      setStatus("ready");
      try {
        await audio.play();
        if (mountedRef.current && generation === generationRef.current && !audio.ended) setStatus("playing");
      } catch {
        if (mountedRef.current && generation === generationRef.current) {
          setStatus("ready");
          setError("Tap play to hear this reply.");
        }
      }
    } catch (cause) {
      if (!controller.signal.aborted && mountedRef.current && generation === generationRef.current) {
        setStatus("unavailable");
        setError(cause instanceof Error ? cause.message : "Voice is temporarily unavailable.");
      }
    } finally {
      if (requestRef.current === controller) requestRef.current = null;
    }
  }, [releaseAudio]);

  return { speak, replay, stop, status, error, hasAudio };
}
