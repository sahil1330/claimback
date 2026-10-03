"use client";

import { useEffect, useRef, useState } from "react";
import { LoaderCircle, Mic, Square } from "lucide-react";
import { transcribeReceivingAudio } from "./voice-api";

type VoiceState = "idle" | "recording" | "transcribing";
const preferredMimeTypes = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg"];

/** The transcript lands in the ordinary composer for editing before it is sent. */
export function VoiceReceivingNote({ disabled, onConfirm }: { disabled: boolean; onConfirm: (transcript: string) => void }) {
  const [state, setState] = useState<VoiceState>("idle");
  const [error, setError] = useState<string | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const requestRef = useRef<AbortController | null>(null);

  useEffect(() => () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    requestRef.current?.abort();
    if (recorderRef.current) {
      recorderRef.current.onstop = null;
      if (recorderRef.current.state === "recording") recorderRef.current.stop();
    }
    streamRef.current?.getTracks().forEach((track) => track.stop());
  }, []);

  async function transcribe(file: File) {
    setState("transcribing");
    setError(null);
    const controller = new AbortController();
    requestRef.current = controller;
    try {
      const result = await transcribeReceivingAudio(file, controller.signal);
      onConfirm(result.transcript);
    } catch (cause) {
      if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Voice is unavailable. Type your note instead.");
    } finally {
      if (requestRef.current === controller) requestRef.current = null;
      setState("idle");
    }
  }

  async function startRecording() {
    setError(null);
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      setError("Recording is not available here. Type your note instead.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mimeType = preferredMimeTypes.find((type) => MediaRecorder.isTypeSupported(type));
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      recorderRef.current = recorder;
      const chunks: Blob[] = [];
      recorder.ondataavailable = (event) => { if (event.data.size) chunks.push(event.data); };
      recorder.onstop = () => {
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
      timeoutRef.current = setTimeout(() => {
        if (recorder.state === "recording") recorder.stop();
      }, 28_000);
    } catch {
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
      setError("Microphone access failed. Allow access or type your note.");
      setState("idle");
    }
  }

  return <div className="inline-flex items-center gap-2">
    <button type="button" aria-label={state === "recording" ? "Stop recording" : state === "transcribing" ? "Transcribing speech" : "Speak to ClaimBack"} title={state === "recording" ? "Stop recording" : "Speak to ClaimBack"} className={`flex size-11 items-center justify-center rounded-lg border transition-colors ${state === "recording" ? "border-primary bg-success-soft text-primary" : "border-border bg-surface text-primary hover:border-primary"}`} disabled={disabled || state === "transcribing"} onClick={() => state === "recording" ? recorderRef.current?.stop() : void startRecording()}>
      {state === "recording" ? <Square className="size-4" aria-hidden="true" /> : state === "transcribing" ? <LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> : <Mic className="size-4" aria-hidden="true" />}
    </button>
    {state === "recording" && <span role="status" className="text-xs font-medium text-primary">Recording… tap to stop</span>}
    {state === "transcribing" && <span role="status" className="text-xs font-medium text-primary">Transcribing…</span>}
    {error && <span role="alert" className="max-w-52 text-xs text-danger">{error}</span>}
  </div>;
}
