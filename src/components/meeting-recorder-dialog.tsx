'use client';

import * as React from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import { toast } from 'sonner';
import { MicIcon, MonitorIcon, SquareIcon } from 'lucide-react';
import type { PlateEditor } from 'platejs/react';
import { KEYS } from 'platejs';

import { Dialog as DialogPrimitive } from 'radix-ui';

import {
  Dialog,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Message, MessageContent } from '@/components/ai/message';
import { cn } from '@/lib/utils';

const OPEN_EVENT = 'notelab:open-meeting-recorder';

type OpenEventDetail = {
  editor: PlateEditor;
};

export function openMeetingRecorder(editor: PlateEditor) {
  window.dispatchEvent(
    new CustomEvent<OpenEventDetail>(OPEN_EVENT, { detail: { editor } })
  );
}

type RecordingState = 'idle' | 'starting' | 'recording' | 'finishing';

type AudioSource = 'mic' | 'system';
type TranscriptKind = 'delta' | 'completed' | 'error';

type TranscriptEventPayload = {
  sessionId: string;
  source: AudioSource;
  kind: TranscriptKind;
  text: string | null;
  itemId: string | null;
  error: string | null;
};

type Utterance = {
  itemId: string;
  source: AudioSource;
  text: string;
  finalized: boolean;
};

function generateSessionId(): string {
  return `meet-${Date.now().toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 8)}`;
}

export function MeetingRecorderDialog() {
  const [open, setOpen] = React.useState(false);
  const [captureSystemAudio, setCaptureSystemAudio] = React.useState(true);
  const [state, setState] = React.useState<RecordingState>('idle');
  const [utterances, setUtterances] = React.useState<Utterance[]>([]);
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);
  const [elapsedMs, setElapsedMs] = React.useState(0);

  const editorRef = React.useRef<PlateEditor | null>(null);
  const sessionIdRef = React.useRef<string | null>(null);
  const startedAtRef = React.useRef<number | null>(null);
  const unlistenRef = React.useRef<UnlistenFn | null>(null);

  React.useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<OpenEventDetail>).detail;
      if (!detail?.editor) return;
      editorRef.current = detail.editor;
      resetState();
      setOpen(true);
    };
    window.addEventListener(OPEN_EVENT, handler);
    return () => window.removeEventListener(OPEN_EVENT, handler);
  }, []);

  React.useEffect(() => {
    if (state !== 'recording') return;
    const interval = window.setInterval(() => {
      if (startedAtRef.current) {
        setElapsedMs(Date.now() - startedAtRef.current);
      }
    }, 500);
    return () => window.clearInterval(interval);
  }, [state]);

  function resetState() {
    setState('idle');
    setUtterances([]);
    setErrorMessage(null);
    setElapsedMs(0);
    startedAtRef.current = null;
  }

  async function handleStart() {
    setErrorMessage(null);
    setState('starting');

    const sessionId = generateSessionId();
    sessionIdRef.current = sessionId;
    console.log('[meeting] handleStart', { sessionId, captureSystemAudio });

    // Listen for transcript events from the Rust pipeline before invoking
    // start, so we don't drop the first delta.
    const unlisten = await listen<TranscriptEventPayload>(
      'transcript-event',
      (event) => {
        const payload = event.payload;
        if (payload.sessionId !== sessionId) return;
        console.log('[meeting] transcript-event', payload);
        applyTranscriptEvent(payload);
      }
    );
    unlistenRef.current = unlisten;

    try {
      await invoke('start_meeting_capture', {
        sessionId,
        captureSystemAudio,
      });
      console.log('[meeting] start_meeting_capture invoke resolved');
    } catch (err) {
      console.error('[meeting] start_meeting_capture failed', err);
      unlisten();
      unlistenRef.current = null;
      const message = err instanceof Error ? err.message : String(err);
      setErrorMessage(message);
      setState('idle');
      return;
    }

    startedAtRef.current = Date.now();
    setElapsedMs(0);
    setState('recording');
  }

  function applyTranscriptEvent(payload: TranscriptEventPayload) {
    if (payload.kind === 'error') {
      const message = payload.error ?? 'transcription error';
      toast.error(`[${payload.source}] ${message}`);
      return;
    }

    const itemId = payload.itemId ?? `${payload.source}-${Date.now()}`;
    const text = payload.text ?? '';
    const finalized = payload.kind === 'completed';

    setUtterances((prev) => {
      const existingIndex = prev.findIndex((u) => u.itemId === itemId);
      if (existingIndex >= 0) {
        const next = prev.slice();
        const existing = next[existingIndex];
        next[existingIndex] = {
          ...existing,
          // For deltas the OpenAI realtime API sends incremental text; for
          // completed it sends the full transcript. Replace on completion,
          // append on delta.
          text: finalized ? text : existing.text + text,
          finalized: finalized || existing.finalized,
        };
        return next;
      }
      return [
        ...prev,
        {
          itemId,
          source: payload.source,
          text,
          finalized,
        },
      ];
    });
  }

  async function handleStop() {
    const sessionId = sessionIdRef.current;
    if (!sessionId) return;
    console.log('[meeting] handleStop', { sessionId });
    setState('finishing');

    try {
      await invoke('stop_meeting_capture', { sessionId });
      console.log('[meeting] stop_meeting_capture invoke resolved');
    } catch (err) {
      console.error('[meeting] stop_meeting_capture failed', err);
      const message = err instanceof Error ? err.message : String(err);
      setErrorMessage(message);
    }

    if (unlistenRef.current) {
      unlistenRef.current();
      unlistenRef.current = null;
    }
    sessionIdRef.current = null;
    setState('idle');
  }

  async function handleInsertAndClose() {
    const editor = editorRef.current;
    const hasAny = utterances.some((u) => u.text.trim().length > 0);
    if (editor && hasAny) {
      insertTranscriptIntoEditor(editor, utterances);
      toast.success('Transcript inserted into note.');
    }
    await handleClose();
  }

  async function handleClose() {
    const sessionId = sessionIdRef.current;
    if (sessionId) {
      try {
        await invoke('stop_meeting_capture', { sessionId });
      } catch {
        // ignore — best effort cleanup
      }
      sessionIdRef.current = null;
    }
    if (unlistenRef.current) {
      unlistenRef.current();
      unlistenRef.current = null;
    }
    setOpen(false);
    window.setTimeout(resetState, 200);
  }

  const transcriptText = buildTranscript(utterances);
  const hasContent = transcriptText.trim().length > 0;
  const isRecording = state === 'recording';
  const isStarting = state === 'starting';
  const isFinishing = state === 'finishing';

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) void handleClose();
      }}
    >
      <DialogPrimitive.Portal>
        {/* Transparent overlay — no dim, no blur. Still catches clicks-outside
            to close the dialog. Pointer-events-auto only on the dialog body. */}
        <DialogPrimitive.Overlay
          className={cn(
            'fixed inset-0 z-50 bg-transparent',
            'data-open:animate-in data-open:fade-in-0',
            'data-closed:animate-out data-closed:fade-out-0'
          )}
        />
        <DialogPrimitive.Content
          className={cn(
            // Anchor to bottom-center with breathing room from the editor.
            'fixed bottom-8 left-1/2 z-50 -translate-x-1/2',
            // Generous size for a chat-style transcript view.
            'flex w-[min(56rem,calc(100vw-4rem))] max-h-[min(70vh,42rem)] flex-col',
            // Surface treatment — solid card, soft shadow, ring instead of dim.
            'rounded-2xl bg-popover text-popover-foreground shadow-2xl ring-1 ring-foreground/10',
            'outline-none',
            'data-open:animate-in data-open:fade-in-0 data-open:slide-in-from-bottom-4',
            'data-closed:animate-out data-closed:fade-out-0 data-closed:slide-out-to-bottom-4'
          )}
        >
          {/* Header */}
          <div className="flex items-start justify-between gap-3 border-b px-5 py-3">
            <div className="flex flex-col gap-0.5">
              <DialogTitle className="text-base">Record Meeting</DialogTitle>
              <DialogDescription>
                Live transcription via OpenAI Realtime. Mic = You, system audio = Other.
              </DialogDescription>
            </div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              {isRecording ? (
                <span className="flex items-center gap-1.5">
                  <span className="relative flex size-2">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-500 opacity-75" />
                    <span className="relative inline-flex size-2 rounded-full bg-red-500" />
                  </span>
                  Recording — {formatDuration(elapsedMs)}
                </span>
              ) : isStarting ? (
                <span>Starting capture…</span>
              ) : isFinishing ? (
                <span>Finishing transcription…</span>
              ) : (
                <span>Idle</span>
              )}
            </div>
          </div>

          {/* Capture options */}
          <div className="flex items-center gap-3 border-b px-5 py-2 text-xs">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={captureSystemAudio}
                disabled={isRecording || isStarting || isFinishing}
                onChange={(event) =>
                  setCaptureSystemAudio(event.target.checked)
                }
              />
              <MonitorIcon className="size-3.5" />
              Capture system audio
            </label>
            <span className="text-muted-foreground">
              macOS 14.4+ — requires the system-audio sidecar
            </span>
          </div>

          {/* Error banner */}
          {errorMessage ? (
            <div className="border-b border-destructive/40 bg-destructive/10 px-5 py-2 text-xs text-destructive">
              {errorMessage}
            </div>
          ) : null}

          {/* Chat transcript */}
          <div className="flex-1 overflow-y-auto px-5 py-4">
            {utterances.length === 0 ? (
              <div className="flex h-full min-h-32 items-center justify-center text-sm text-muted-foreground">
                Transcript will appear here as audio is captured.
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                {utterances.map((utterance) => {
                  const isMic = utterance.source === 'mic';
                  return (
                    <Message
                      key={utterance.itemId}
                      from={isMic ? 'user' : 'assistant'}
                    >
                      <div
                        className={cn(
                          'text-[10px] font-semibold uppercase tracking-wider text-muted-foreground',
                          isMic ? 'text-right' : 'text-left'
                        )}
                      >
                        {SPEAKER_LABELS[utterance.source]}
                      </div>
                      <MessageContent>
                        <p
                          className={cn(
                            !utterance.finalized && 'text-muted-foreground'
                          )}
                        >
                          {utterance.text || '…'}
                        </p>
                      </MessageContent>
                    </Message>
                  );
                })}
              </div>
            )}
          </div>

          {/* Footer / actions */}
          <div className="flex items-center justify-end gap-2 border-t px-5 py-3">
            <Button variant="ghost" onClick={() => void handleClose()}>
              Cancel
            </Button>
            {!isRecording ? (
              <Button
                variant="outline"
                onClick={() => void handleStart()}
                disabled={isStarting || isFinishing}
              >
                <MicIcon className="size-4" />
                {utterances.length === 0
                  ? 'Start Recording'
                  : 'Resume Recording'}
              </Button>
            ) : (
              <Button variant="outline" onClick={() => void handleStop()}>
                <SquareIcon className="size-4" />
                Stop
              </Button>
            )}
            <Button
              onClick={() => void handleInsertAndClose()}
              disabled={
                isRecording || isStarting || isFinishing || !hasContent
              }
            >
              Insert into note
            </Button>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </Dialog>
  );
}

function buildTranscript(utterances: Utterance[]): string {
  return utterances
    .map((u) => u.text.trim())
    .filter(Boolean)
    .join(' ');
}

function formatDuration(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes.toString().padStart(2, '0')}:${seconds
    .toString()
    .padStart(2, '0')}`;
}

// Today the OpenAI Realtime WebSocket does not surface speaker labels
// (gpt-4o-transcribe-diarize is documented for the batch endpoint only).
// We have two streams though, so we can label by *source*: mic = "You",
// system audio = "Other". For an actual A/B/C diarization we'd need to run
// the captured audio through /v1/audio/transcriptions afterwards.
const SPEAKER_LABELS: Record<AudioSource, string> = {
  mic: 'You',
  system: 'Other',
};

function insertTranscriptIntoEditor(
  editor: PlateEditor,
  utterances: Utterance[]
) {
  const heading = `Meeting Transcript — ${new Date().toLocaleString()}`;

  // Group consecutive utterances from the same source into one paragraph,
  // so a single back-and-forth doesn't render as 20 mini-paragraphs.
  const groups: { source: AudioSource; text: string }[] = [];
  for (const utterance of utterances) {
    const text = utterance.text.trim();
    if (!text) continue;
    const last = groups[groups.length - 1];
    if (last && last.source === utterance.source) {
      last.text = `${last.text} ${text}`;
    } else {
      groups.push({ source: utterance.source, text });
    }
  }

  editor.tf.insertNodes(
    [
      { type: KEYS.h2, children: [{ text: heading }] },
      ...groups.map((group) => ({
        type: KEYS.p,
        children: [
          { text: `${SPEAKER_LABELS[group.source]}: `, bold: true },
          { text: group.text },
        ],
      })),
    ],
    { select: true }
  );
}
