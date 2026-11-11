import { useState, useRef, useCallback, useEffect } from 'react';

export function useAuraVoiceInput() {
  const [isListening, setIsListening] = useState(false);
  const [liveTranscript, setLiveTranscript] = useState('');
  const recognitionRef = useRef(null);
  const recorderRef = useRef(null);
  const chunksRef = useRef([]);
  const transcriptRef = useRef('');

  const stopTracks = (stream) => {
    try {
      stream?.getTracks?.().forEach((t) => t.stop());
    } catch {
      // Ignore cleanup error
    }
  };

  const cleanup = useCallback(() => {
    if (recognitionRef.current) {
      try {
        recognitionRef.current.onresult = null;
        recognitionRef.current.onend = null;
        recognitionRef.current.onerror = null;
        recognitionRef.current.stop();
      } catch {
        // Ignore stop error
      }
      recognitionRef.current = null;
    }
    if (recorderRef.current && recorderRef.current.state !== 'inactive') {
      try {
        recorderRef.current.stop();
      } catch {
        // Ignore recorder error
      }
    }
    setIsListening(false);
  }, []);

  useEffect(() => cleanup, [cleanup]);

  const startListening = useCallback(async ({ onComplete, onError } = {}) => {
    if (isListening) {
      cleanup();
      return;
    }

    setLiveTranscript('');
    transcriptRef.current = '';

    const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;

    // Prefer live SpeechRecognition (gives real-time transcript feedback!) with MediaRecorder fallback
    if (SpeechRec) {
      try {
        const rec = new SpeechRec();
        rec.lang = 'es-US';
        rec.continuous = true;
        rec.interimResults = true;
        let finalText = '';
        let completed = false;

        rec.onresult = (event) => {
          let interim = '';
          for (let i = event.resultIndex; i < event.results.length; i++) {
            const phrase = event.results[i][0]?.transcript || '';
            if (event.results[i].isFinal) {
              finalText += `${phrase} `;
            } else {
              interim += phrase;
            }
          }
          const combined = `${finalText}${interim}`.trim();
          transcriptRef.current = combined;
          setLiveTranscript(combined);
        };

        rec.onerror = (ev) => {
          if (completed) return;
          completed = true;
          setIsListening(false);
          recognitionRef.current = null;
          if (ev?.error === 'not-allowed') {
            onError?.('Permiso de micrófono denegado. Habilítalo o escribe/toma foto.');
          } else if (ev?.error !== 'aborted' && ev?.error !== 'no-speech') {
            onError?.(`Error de micrófono: ${ev.error}`);
          }
        };

        rec.onend = () => {
          if (completed) return;
          completed = true;
          setIsListening(false);
          recognitionRef.current = null;
          const spoken = transcriptRef.current.trim();
          if (spoken) {
            onComplete?.({ transcript: spoken, audioBlob: null });
          }
        };

        recognitionRef.current = rec;
        rec.start();
        setIsListening(true);
        return;
      } catch (err) {
        console.warn('SpeechRecognition fallback to MediaRecorder:', err);
      }
    }

    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      onError?.('Tu navegador no soporta dictado por voz. Puedes escribir o subir una foto.');
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : MediaRecorder.isTypeSupported('audio/mp4')
        ? 'audio/mp4'
        : 'audio/webm';
      const recorder = new MediaRecorder(stream, { mimeType });
      chunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.onstop = () => {
        stopTracks(stream);
        setIsListening(false);
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || mimeType });
        if (blob.size > 500) {
          onComplete?.({ transcript: '', audioBlob: blob });
        }
      };
      recorderRef.current = recorder;
      recorder.start();
      setIsListening(true);
    } catch {
      onError?.('No se pudo acceder al micrófono. Revisa los permisos del navegador.');
    }
  }, [cleanup, isListening]);

  const clearTranscript = useCallback(() => {
    transcriptRef.current = '';
    setLiveTranscript('');
  }, []);

  return {
    isListening,
    liveTranscript,
    startListening,
    stopListening: cleanup,
    clearTranscript
  };
}
