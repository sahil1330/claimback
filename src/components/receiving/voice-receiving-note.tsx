"use client";

import { useEffect, useRef, useState } from "react";
import { LoaderCircle, Mic, Square, UploadCloud } from "lucide-react";
import { Button } from "@/components/ui/button";
import { transcribeReceivingAudio } from "./voice-api";

type VoiceState = "idle" | "recording" | "transcribing" | "review";

const preferredMimeTypes = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg"];

export function VoiceReceivingNote({ disabled, hasExistingNote, onConfirm }: {
  disabled: boolean;
  hasExistingNote: boolean;
  onConfirm: (transcript: string) => void;
}) {
  const [state, setState] = useState<VoiceState>("idle");
  const [transcript, setTranscript] = useState("");
  const [languageCode, setLanguageCode] = useState<string | null>(null);
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
      setTranscript(result.transcript);
      setLanguageCode(result.languageCode);
      setState("review");
    } catch (cause) {
      if (controller.signal.aborted) return;
      setError(cause instanceof Error ? cause.message : "Voice is unavailable right now.");
      setState("idle");
    } finally {
      if (requestRef.current === controller) requestRef.current = null;
    }
  }

  async function startRecording() {
    setError(null);
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      setError("Recording is not available in this browser. Choose an audio file or type your note.");
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
        setError("Recording stopped unexpectedly. Retry or type your note.");
        setState("idle");
      };
      recorder.start();
      setState("recording");
      timeoutRef.current = setTimeout(() => {
        if (recorder.state === "recording") recorder.stop();
      }, 45_000);
    } catch {
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
      setError("Microphone access failed. Allow access, choose an audio file or type your note.");
      setState("idle");
    }
  }

  function confirmTranscript() {
    const confirmed = transcript.trim();
    if (!confirmed) return;
    onConfirm(confirmed);
    setTranscript("");
    setLanguageCode(null);
    setState("idle");
    setError(null);
  }

  return (
    <div className="mt-4 rounded-xl border border-border bg-surface-soft p-3 sm:p-4" aria-label="Optional voice receiving note">
      <p className="text-xs font-semibold text-foreground">Or speak what arrived</p>
      <p className="mt-1 text-xs leading-5 text-muted">Voice is optional. Review the words before they enter your receiving note.</p>
      {state !== "review" && <div className="mt-3 flex flex-wrap items-center gap-2">
        {state === "recording" ? (
          <Button type="button" variant="outline" className="min-h-11" onClick={() => { if (recorderRef.current?.state === "recording") recorderRef.current.stop(); }}><Square aria-hidden="true" />Stop & transcribe</Button>
        ) : (
          <Button type="button" variant="outline" className="min-h-11" disabled={disabled || state === "transcribing"} onClick={startRecording}><Mic aria-hidden="true" />Record note</Button>
        )}
        <label className={`inline-flex min-h-11 items-center gap-2 rounded-lg border border-border bg-surface px-3 text-xs font-semibold text-foreground ${disabled || state !== "idle" ? "cursor-not-allowed opacity-50" : "cursor-pointer"}`}>
          <UploadCloud className="size-4" aria-hidden="true" />Choose audio
          <input className="sr-only" type="file" accept="audio/webm,audio/wav,audio/mpeg,audio/mp4,audio/ogg,audio/aac,audio/flac,.m4a" disabled={disabled || state !== "idle"} onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = "";
            if (file) void transcribe(file);
          }} />
        </label>
      </div>}
      {state === "recording" && <p role="status" className="mt-3 text-xs font-medium text-primary">Recording… Stops automatically after 45 seconds.</p>}
      {state === "transcribing" && <p role="status" className="mt-3 inline-flex items-center gap-2 text-xs font-medium text-primary"><LoaderCircle className="size-4 motion-safe:animate-spin" aria-hidden="true" />Transcribing your note…</p>}
      {state === "review" && <div className="mt-3 rounded-lg border border-primary/20 bg-surface p-3" aria-live="polite">
        <label className="block text-xs font-semibold">Review and edit transcript<textarea className="mt-2 min-h-24 w-full rounded-lg border border-border bg-surface p-3 text-sm font-normal focus:border-primary focus:outline-none" value={transcript} onChange={(event) => setTranscript(event.target.value)} /></label>
        {languageCode && <p className="mt-2 text-xs text-muted">Detected language: {languageCode}</p>}
        <p className="mt-2 text-xs text-muted">{hasExistingNote ? "Confirmation replaces the note you typed above." : "Only your confirmed words will be used as the receiving note."} You will still review the counts below.</p>
        <div className="mt-3 flex flex-wrap gap-2"><Button type="button" size="sm" disabled={disabled || !transcript.trim()} onClick={confirmTranscript}>Use confirmed transcript</Button><Button type="button" size="sm" variant="outline" onClick={() => { setTranscript(""); setState("idle"); }}>Discard</Button></div>
      </div>}
      {error && <p role="alert" className="mt-3 rounded-lg bg-danger-soft p-3 text-xs text-danger">{error} Retry voice or continue by typing your note and counts below.</p>}
    </div>
  );
}
