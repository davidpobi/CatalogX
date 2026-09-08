"use client";

import { ImagePlus, Mic, Search, Square, Sparkles } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { SearchSuggestion } from "@/interfaces/intelligence";
import { IconButton } from "./primitives";

interface Props {
  prompt: string;
  setPrompt: (prompt: string) => void;
  onSubmit: (prompt?: string) => void;
  onAudio: (audio: Blob) => Promise<void>;
  busy: boolean;
  suggestions: SearchSuggestion[];
  onSuggestion?: (suggestion: SearchSuggestion) => void;
  autoFocus?: boolean;
  onScene?: (file: File) => void;
  sceneBusy?: boolean;
}

export function SearchComposer({ prompt, setPrompt, onSubmit, onAudio, busy, suggestions, onSuggestion, autoFocus = false, onScene, sceneBusy = false }: Props) {
  const recorder = useRef<MediaRecorder | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const chunks = useRef<Blob[]>([]);
  const imageInput = useRef<HTMLInputElement | null>(null);
  const [recording, setRecording] = useState(false);
  const [recordingError, setRecordingError] = useState<string | null>(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); recorder.current?.stream.getTracks().forEach((track) => track.stop()); }, []);

  const stop = () => recorder.current?.state === "recording" && recorder.current.stop();
  const start = async () => {
    setRecordingError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const next = new MediaRecorder(stream, { mimeType: MediaRecorder.isTypeSupported("audio/webm") ? "audio/webm" : undefined });
      chunks.current = [];
      next.ondataavailable = (event) => { if (event.data.size) chunks.current.push(event.data); };
      next.onstop = async () => {
        setRecording(false); stream.getTracks().forEach((track) => track.stop());
        if (timer.current) clearTimeout(timer.current);
        const audio = new Blob(chunks.current, { type: next.mimeType || "audio/webm" });
        if (audio.size) await onAudio(audio);
      };
      recorder.current = next; next.start(); setRecording(true); timer.current = setTimeout(stop, 30_000);
    } catch { setRecordingError("Microphone access is unavailable."); }
  };

  return <section className="search-shell" aria-label="Smart catalogue search">
    <div className="search-composer">
      <Sparkles className="composer-mark" aria-hidden="true" />
      <textarea aria-label="Describe what you need" maxLength={800} rows={1} placeholder="Describe a room, product, mood, budget or delivery need…" value={prompt} autoFocus={autoFocus} onChange={(event) => setPrompt(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); onSubmit(); } }} disabled={busy || recording} />
      {onScene && <>
        <input ref={imageInput} className="visually-hidden" type="file" accept="image/jpeg,image/png,image/webp" aria-label="Upload your space" onChange={(event) => { const file = event.target.files?.[0]; if (file) onScene(file); event.currentTarget.value = ""; }} />
        <IconButton label="Upload your space" onClick={() => imageInput.current?.click()} disabled={busy || sceneBusy}>{sceneBusy ? <span className="spinner" /> : <ImagePlus size={18} />}</IconButton>
      </>}
      <IconButton label={recording ? "Stop recording" : "Search by voice"} className={recording ? "recording" : ""} onClick={recording ? stop : start} disabled={busy}>{recording ? <Square size={16} /> : <Mic size={18} />}</IconButton>
      <IconButton label="Search catalogue" className="search-submit" onClick={() => onSubmit()} disabled={busy || prompt.trim().length < 2}>{busy ? <span className="spinner" /> : <Search size={18} />}</IconButton>
    </div>
    {recording && <p className="recording-note"><span /> Listening. Recording stops at 30 seconds.</p>}
    {recordingError && <p role="alert" className="error-note">{recordingError}</p>}
    {suggestions.length > 0 && <div className="suggestion-row" aria-label="Suggested refinements">{suggestions.map((suggestion) => <button key={suggestion.id} onClick={() => onSuggestion ? onSuggestion(suggestion) : onSubmit(suggestion.prompt)} disabled={busy}>{suggestion.label}</button>)}</div>}
  </section>;
}
