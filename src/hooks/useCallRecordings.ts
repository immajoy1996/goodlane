import { useCallback, useMemo, useState } from 'react'
import { analyzeCall, normalizeCallAnalysis } from '../services/callAnalysis'
import { discoverCallRecordings } from '../services/callRecordings'
import {
  clearAllCallCache,
  loadStoredAnalysis,
  loadStoredTranscripts,
  saveAnalysis,
  saveTranscript,
} from '../services/callStorage'
import { buildCallThreads, computeCallStats } from '../services/callThreading'
import { transcribeCall } from '../services/callTranscription'
import { isTranscriptionConfigured } from '../services/transcriptionConfig'
import { isChatConfigured } from '../services/chatConfig'
import { runWithConcurrency } from '../utils/runWithConcurrency'
import type {
  BatchProgress,
  CallAnalysis,
  CallTranscript,
  EnrichedCall,
  RawCallRecording,
} from '../types/calls'

const TRANSCRIBE_CONCURRENCY = 4

function createInitialTranscript(recording: RawCallRecording): CallTranscript {
  return {
    callId: recording.callId,
    fileName: recording.fileName,
    transcript: '',
    status: 'not_started',
    error: null,
  }
}

function mergeRecordingState(
  recordings: RawCallRecording[],
  transcripts: Record<string, CallTranscript>,
  analysisMap: Record<string, CallAnalysis>,
): EnrichedCall[] {
  return recordings.map((recording) => ({
    ...recording,
    transcript: transcripts[recording.callId],
    analysis: analysisMap[recording.callId],
  }))
}

export function useCallRecordings() {
  const recordings = useMemo(() => discoverCallRecordings(), [])

  const [transcripts, setTranscripts] = useState<Record<string, CallTranscript>>(() =>
    loadStoredTranscripts(),
  )
  const [analysisMap, setAnalysisMap] = useState<Record<string, CallAnalysis>>(() => {
    const stored = loadStoredAnalysis()
    return Object.fromEntries(
      Object.entries(stored).map(([callId, analysis]) => [
        callId,
        normalizeCallAnalysis(analysis),
      ]),
    )
  })
  const [batchProgress, setBatchProgress] = useState<BatchProgress>({
    active: false,
    current: 0,
    total: 0,
    successful: 0,
    failed: 0,
    remaining: 0,
    label: '',
  })
  const [transcribingFileName, setTranscribingFileName] = useState<string | null>(null)

  const calls = useMemo(
    () => mergeRecordingState(recordings, transcripts, analysisMap),
    [recordings, transcripts, analysisMap],
  )

  const threads = useMemo(() => buildCallThreads(calls), [calls])
  const stats = useMemo(() => computeCallStats(calls, threads), [calls, threads])

  const updateTranscript = useCallback((transcript: CallTranscript) => {
    saveTranscript(transcript)
    setTranscripts((current) => ({ ...current, [transcript.callId]: transcript }))
  }, [])

  const updateAnalysis = useCallback((callId: string, analysis: CallAnalysis) => {
    const normalized = normalizeCallAnalysis(analysis)
    saveAnalysis(callId, normalized)
    setAnalysisMap((current) => ({ ...current, [callId]: normalized }))
  }, [])

  const transcribeOne = useCallback(
    async (recording: RawCallRecording, force = false) => {
      const existing = transcripts[recording.callId]
      if (!force && existing?.status === 'success') {
        return
      }

      const pending: CallTranscript = {
        ...createInitialTranscript(recording),
        status: 'transcribing',
      }
      setTranscribingFileName(recording.fileName)
      updateTranscript(pending)

      try {
        const transcriptText = await transcribeCall(recording)
        updateTranscript({
          callId: recording.callId,
          fileName: recording.fileName,
          transcript: transcriptText,
          status: 'success',
          error: null,
        })
      } catch (error) {
        updateTranscript({
          callId: recording.callId,
          fileName: recording.fileName,
          transcript: existing?.transcript ?? '',
          status: 'failed',
          error: error instanceof Error ? error.message : 'Transcription failed',
        })
        throw error
      } finally {
        setTranscribingFileName(null)
      }
    },
    [transcripts, updateTranscript],
  )

  const analyzeOne = useCallback(
    async (recording: EnrichedCall, force = false) => {
      const transcript = transcripts[recording.callId]
      if (!transcript || transcript.status !== 'success' || !transcript.transcript) {
        throw new Error('Transcript required before analysis')
      }

      if (!force && analysisMap[recording.callId]) {
        return
      }

      const analysis = await analyzeCall(transcript.transcript, recording.fileTypeHint)
      updateAnalysis(recording.callId, analysis)
    },
    [analysisMap, transcripts, updateAnalysis],
  )

  const transcribeAll = useCallback(async () => {
    const pending = recordings.filter((recording) => {
      const transcript = transcripts[recording.callId]
      return transcript?.status !== 'success'
    })

    setBatchProgress({
      active: true,
      current: 0,
      total: pending.length,
      successful: 0,
      failed: 0,
      remaining: pending.length,
      label: 'Transcribing',
    })

    let successful = 0
    let failed = 0
    let current = 0

    await runWithConcurrency(pending, TRANSCRIBE_CONCURRENCY, async (recording) => {
      try {
        await transcribeOne(recording)
        successful += 1
      } catch {
        failed += 1
      } finally {
        current += 1
        setBatchProgress({
          active: current < pending.length,
          current,
          total: pending.length,
          successful,
          failed,
          remaining: pending.length - current,
          label: 'Transcribing',
        })
      }
    })

    setBatchProgress((state) => ({ ...state, active: false }))
  }, [recordings, transcripts, transcribeOne])

  const analyzeAll = useCallback(async () => {
    const pending = calls.filter((call) => {
      const transcript = transcripts[call.callId]
      return transcript?.status === 'success' && !analysisMap[call.callId]
    })

    setBatchProgress({
      active: true,
      current: 0,
      total: pending.length,
      successful: 0,
      failed: 0,
      remaining: pending.length,
      label: 'Analyzing',
    })

    let successful = 0
    let failed = 0
    let current = 0

    await runWithConcurrency(pending, TRANSCRIBE_CONCURRENCY, async (recording) => {
      try {
        await analyzeOne(recording)
        successful += 1
      } catch {
        failed += 1
      } finally {
        current += 1
        setBatchProgress({
          active: current < pending.length,
          current,
          total: pending.length,
          successful,
          failed,
          remaining: pending.length - current,
          label: 'Analyzing',
        })
      }
    })

    setBatchProgress((state) => ({ ...state, active: false }))
  }, [analysisMap, analyzeOne, calls, transcripts])

  const clearCache = useCallback(() => {
    clearAllCallCache()
    setTranscripts({})
    setAnalysisMap({})
  }, [])

  return {
    recordings,
    calls,
    threads,
    stats,
    batchProgress,
    transcribingFileName,
    isTranscriptionConfigured: isTranscriptionConfigured(),
    isChatConfigured: isChatConfigured(),
    transcribeOne,
    analyzeOne,
    transcribeAll,
    analyzeAll,
    clearCache,
  }
}
