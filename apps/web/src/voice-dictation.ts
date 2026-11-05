export type DictationState = "idle" | "starting" | "recording" | "transcribing";

export function appendDictation(draft: string, text: string) {
  const spoken = text.trim();
  return spoken ? `${draft}${draft && !/\s$/.test(draft) ? " " : ""}${spoken}` : draft;
}

/** One recording, owned by one draft. Cancellation must never populate another conversation. */
export function createVoiceDictation(options: {
  transcribe: (audio: Blob, signal: AbortSignal) => Promise<{ text: string }>;
  onState: (state: DictationState) => void;
  onText: (text: string) => void;
  onError: (message: string) => void;
  onLevel?: (level: number) => void;
}) {
  let stream: MediaStream | null = null;
  let recorder: MediaRecorder | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let closed = false;
  let started = false;
  const abort = new AbortController();
  const chunks: Blob[] = [];
  let audioContext: AudioContext | null = null;
  let meterSink: GainNode | null = null;
  let meterFrame: number | null = null;
  const release = () => {
    clearTimeout(timer);
    if (meterFrame !== null) cancelAnimationFrame(meterFrame);
    meterFrame = null;
    void audioContext?.close().catch(() => undefined);
    audioContext = null;
    meterSink = null;
    options.onLevel?.(0);
    stream?.getTracks().forEach((track) => track.stop());
  };
  const cancel = () => {
    if (closed) return;
    closed = true;
    abort.abort();
    if (recorder) {
      recorder.onstop = null;
      recorder.onerror = null;
      recorder.ondataavailable = null;
      if (recorder.state !== "inactive") recorder.stop();
    }
    release();
    options.onState("idle");
  };
  const fail = (message: string) => {
    if (closed) return;
    options.onError(message);
    cancel();
  };
  const stop = () => {
    if (closed || recorder?.state !== "recording") return;
    options.onState("transcribing");
    clearTimeout(timer);
    recorder.stop();
  };
  const start = async () => {
    if (closed || started) return;
    started = true;
    if (!window.isSecureContext) {
      fail("Для диктовки откройте сайт по HTTPS или на localhost.");
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      fail(
        "Браузер не поддерживает запись с микрофона. Введите ответ вручную или откройте другой браузер.",
      );
      return;
    }
    options.onState("starting");
    try {
      // Resume Web Audio while the click's user activation is still available.
      // Never wait for it: some browsers keep resume() pending until another
      // gesture, and recording must not depend on the optional level meter.
      if (options.onLevel && typeof AudioContext !== "undefined") {
        try {
          audioContext = new AudioContext({ latencyHint: "interactive" });
          if (audioContext.state === "suspended") {
            void audioContext.resume().catch(() => undefined);
          }
        } catch {
          audioContext = null;
        }
      }
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (closed) {
        release();
        return;
      }
      if (options.onLevel) {
        options.onLevel(0.1);
        if (audioContext) {
          try {
            const source = audioContext.createMediaStreamSource(stream);
            const analyser = audioContext.createAnalyser();
            analyser.fftSize = 256;
            analyser.smoothingTimeConstant = 0.2;
            source.connect(analyser);
            // Keep the meter graph alive through an inaudible sink; the
            // recorder captures the original stream independently.
            meterSink = audioContext.createGain();
            meterSink.gain.value = 0;
            analyser.connect(meterSink);
            meterSink.connect(audioContext.destination);
            const samples = new Float32Array(analyser.fftSize);
            let smoothed = 0.1;
            const measure = () => {
              if (closed || recorder?.state === "inactive") return;
              analyser.getFloatTimeDomainData(samples);
              let sum = 0;
              let peak = 0;
              for (const sample of samples) {
                sum += sample * sample;
                peak = Math.max(peak, Math.abs(sample));
              }
              const rms = Math.sqrt(sum / samples.length);
              const measured = Math.min(1, Math.max(rms / 0.075, peak / 0.24));
              // A visible floor confirms recording; voice movement uses the
              // remaining range.
              const displayed = 0.1 + measured * 0.9;
              smoothed =
                displayed > smoothed
                  ? smoothed * 0.12 + displayed * 0.88
                  : smoothed * 0.58 + displayed * 0.42;
              options.onLevel?.(Math.max(0.1, smoothed));
              meterFrame = requestAnimationFrame(measure);
            };
            measure();
          } catch {
            // A broken analyser must not prevent recording or its indicator.
            void audioContext.close().catch(() => undefined);
            audioContext = null;
            meterSink = null;
          }
        }
      }
      recorder = new MediaRecorder(stream);
      recorder.ondataavailable = (event) => {
        if (!closed && event.data.size) chunks.push(event.data);
      };
      recorder.onerror = () =>
        fail("Запись прервалась. Проверьте микрофон и повторите диктовку; текст ответа сохранён.");
      recorder.onstop = () => {
        release();
        if (closed) return;
        options.onState("transcribing");
        const audio = new Blob(chunks, { type: recorder?.mimeType || "audio/webm" });
        if (!audio.size) {
          fail("Запись пустая. Повторите диктовку.");
          return;
        }
        timer = setTimeout(
          () =>
            fail(
              "Распознавание заняло слишком много времени. Повторите диктовку или введите ответ вручную.",
            ),
          60_000,
        );
        void options
          .transcribe(audio, abort.signal)
          .then((result) => {
            if (closed) return;
            if (!result.text?.trim()) {
              fail("Речь не распознана. Повторите диктовку.");
              return;
            }
            options.onText(result.text);
            cancel();
          })
          .catch((error) => {
            fail(
              error instanceof Error
                ? error.message
                : "Не удалось распознать речь. Текст ответа сохранён.",
            );
          });
      };
      recorder.start();
      options.onState("recording");
      timer = setTimeout(stop, 120_000);
    } catch {
      fail(
        "Не удалось включить микрофон. Разрешите доступ в браузере и проверьте подключение микрофона.",
      );
    }
  };
  return { start, stop, cancel };
}
