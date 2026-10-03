"use client";

import { useEffect, useRef, useState } from "react";
import { LoaderCircle, Mic, Square } from "lucide-react";
import { transcribeReceivingAudio } from "./voice-api";
import { audioLevel, initialVoiceActivity, observeVoice } from "./voice-activity";

type VoiceState = "idle" | "recording" | "transcribing";
const preferredMimeTypes = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg"];

/** The transcript lands in the ordinary composer for editing before it is sent. */
export function VoiceReceivingNote({ disabled, onConfirm }: { disabled: boolean; onConfirm: (transcript: string, languageCode: string | null) => void }) {
  const [state, setState] = useState<VoiceState>("idle");
  const [error, setError] = useState<string | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stopAnalysisRef = useRef<(() => void) | null>(null);
  const requestRef = useRef<AbortController | null>(null);
  const startingRef = useRef(false);
  const mountedRef = useRef(false);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      stopAnalysisRef.current?.();
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      requestRef.current?.abort();
      if (recorderRef.current) {
        recorderRef.current.onstop = null;
        if (recorderRef.current.state === "recording") recorderRef.current.stop();
      }
      streamRef.current?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  function stopRecording() {
    const recorder = recorderRef.current;
    if (recorder?.state !== "recording") return;
    stopAnalysisRef.current?.();
    recorder.stop();
  }

  function watchForPause(stream: MediaStream, recorder: MediaRecorder) {
    if (typeof AudioContext === "undefined") return;
    let context: AudioContext | null = null;
    try {
      context = new AudioContext();
      const source = context.createMediaStreamSource(stream);
      const analyser = context.createAnalyser();
      analyser.fftSize = 2048;
      source.connect(analyser);
      const samples = new Float32Array(analyser.fftSize);
      let activity = initialVoiceActivity();
      const interval = setInterval(() => {
        if (recorder.state !== "recording") return;
        analyser.getFloatTimeDomainData(samples);
        const observation = observeVoice(activity, audioLevel(samples), performance.now());
        activity = observation.activity;
        if (observation.shouldStop) stopRecording();
      }, 50);
      stopAnalysisRef.current = () => {
        clearInterval(interval);
        source.disconnect();
        analyser.disconnect();
        void context?.close().catch(() => {});
        stopAnalysisRef.current = null;
      };
      void context.resume().catch(() => {});
    } catch {
      // Recording and manual Stop still work if audio analysis is unavailable.
      void context?.close().catch(() => {});
    }
  }

  async function transcribe(file: File) {
    setState("transcribing");
    setError(null);
    const controller = new AbortController();
    requestRef.current = controller;
    try {
      const result = await transcribeReceivingAudio(file, controller.signal);
      onConfirm(result.transcript, result.languageCode);
    } catch (cause) {
      if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Voice is unavailable. Type your note instead.");
    } finally {
      if (requestRef.current === controller) requestRef.current = null;
      setState("idle");
    }
  }

  async function startRecording() {
    if (startingRef.current || recorderRef.current) return;
    startingRef.current = true;
    setError(null);
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      setError("Recording is not available here. Type your note instead.");
      startingRef.current = false;
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (!mountedRef.current) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      streamRef.current = stream;
      const mimeType = preferredMimeTypes.find((type) => MediaRecorder.isTypeSupported(type));
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      recorderRef.current = recorder;
      const chunks: Blob[] = [];
      recorder.ondataavailable = (event) => { if (event.data.size) chunks.push(event.data); };
      recorder.onstop = () => {
        stopAnalysisRef.current?.();
        stream.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
        recorderRef.current = null;
        if (timeoutRef.current) clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
        const type = recorder.mimeType || mimeType || "audio/webm";
        const extension = type.includes("mp4") ? "m4a" : type.includes("ogg") ? "ogg" : "webm";
        void transcribe(new File(chunks, `receiving-note.${extension}`, { type }));
      };
      recorder.onerror = () => {
        recorder.onstop = null;
        stopAnalysisRef.current?.();
        stream.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
        recorderRef.current = null;
        if (timeoutRef.current) clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
        setError("Recording stopped unexpectedly. Type your note or try again.");
        setState("idle");
      };
      recorder.start();
      setState("recording");
      watchForPause(stream, recorder);
      timeoutRef.current = setTimeout(() => {
        stopRecording();
      }, 28_000);
    } catch {
      stopAnalysisRef.current?.();
      if (recorderRef.current) {
        recorderRef.current.onstop = null;
        if (recorderRef.current.state === "recording") recorderRef.current.stop();
        recorderRef.current = null;
      }
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
      setError("Microphone access failed. Allow access or type your note.");
      setState("idle");
    } finally {
      startingRef.current = false;
    }
  }

  return <div className="inline-flex items-center gap-2">
    <button type="button" aria-label={state === "recording" ? "Stop recording" : state === "transcribing" ? "Transcribing speech" : "Speak to ClaimBack"} title={state === "recording" ? "Stop recording" : "Speak to ClaimBack"} className={`flex size-11 items-center justify-center rounded-lg border transition-colors ${state === "recording" ? "border-primary bg-success-soft text-primary" : "border-border bg-surface text-primary hover:border-primary"}`} disabled={(disabled && state !== "recording") || state === "transcribing"} onClick={() => state === "recording" ? stopRecording() : void startRecording()}>
      {state === "recording" ? <Square className="size-4" aria-hidden="true" /> : state === "transcribing" ? <LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> : <Mic className="size-4" aria-hidden="true" />}
    </button>
    {state === "recording" && <span role="status" className="max-w-48 text-xs font-medium leading-4 text-primary">Listening… a short pause starts transcription. Tap to stop.</span>}
    {state === "transcribing" && <span role="status" className="text-xs font-medium text-primary">Transcribing…</span>}
    {error && <span role="alert" className="max-w-52 text-xs text-danger">{error}</span>}
  </div>;
}
