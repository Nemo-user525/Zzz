const TRANSCRIPTION_RATE = 16000;

/** Convert mono WebAudio samples into a standard PCM16 WAV accepted by the ASR API. */
export function encodeVoiceWav(chunks: Float32Array[], sampleRate: number): ArrayBuffer {
  if (!Number.isFinite(sampleRate) || sampleRate <= 0) throw new Error('Invalid audio sample rate');
  const inputLength = chunks.reduce((total, chunk) => total + chunk.length, 0);
  const input = new Float32Array(inputLength);
  let offset = 0;
  for (const chunk of chunks) { input.set(chunk, offset); offset += chunk.length; }
  const ratio = sampleRate / TRANSCRIPTION_RATE;
  const outputLength = Math.floor(inputLength / ratio);
  const buffer = new ArrayBuffer(44 + outputLength * 2);
  const view = new DataView(buffer);
  const text = (at: number, value: string) => {
    for (let index = 0; index < value.length; index += 1) view.setUint8(at + index, value.charCodeAt(index));
  };
  text(0, 'RIFF');
  view.setUint32(4, buffer.byteLength - 8, true);
  text(8, 'WAVE');
  text(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, TRANSCRIPTION_RATE, true);
  view.setUint32(28, TRANSCRIPTION_RATE * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  text(36, 'data');
  view.setUint32(40, outputLength * 2, true);
  for (let index = 0; index < outputLength; index += 1) {
    const start = index * ratio;
    let sample: number;
    if (ratio >= 1) {
      // Weighted averaging also handles non-integer 44.1 kHz input.
      const end = Math.min(inputLength, (index + 1) * ratio);
      let sum = 0;
      for (let source = Math.floor(start); source < Math.ceil(end); source += 1) {
        sum += input[source] * (Math.min(end, source + 1) - Math.max(start, source));
      }
      sample = sum / (end - start);
    } else {
      const source = Math.floor(start);
      const fraction = start - source;
      sample = input[source] * (1 - fraction) + input[Math.min(source + 1, inputLength - 1)] * fraction;
    }
    sample = Math.max(-1, Math.min(1, Number.isFinite(sample) ? sample : 0));
    view.setInt16(44 + index * 2, Math.round(sample * (sample < 0 ? 32768 : 32767)), true);
  }
  return buffer;
}

const WORKLET_SOURCE = `
class XiaoXCapture extends AudioWorkletProcessor {
  constructor() { super(); this.samples = new Float32Array(2048); this.offset = 0; }
  process(inputs) {
    const channels = inputs[0];
    if (channels && channels.length) {
      for (let index = 0; index < channels[0].length; index += 1) {
        let sample = 0;
        for (const channel of channels) sample += channel[index] || 0;
        this.samples[this.offset++] = sample / channels.length;
        if (this.offset === this.samples.length) {
          this.port.postMessage(this.samples, [this.samples.buffer]);
          this.samples = new Float32Array(2048);
          this.offset = 0;
        }
      }
    }
    return true;
  }
}
registerProcessor('xiaox-pcm-capture', XiaoXCapture);
`;

/** Capture in a worklet, with a compatibility fallback for older embedded browsers. */
export async function captureVoicePcm(context: AudioContext, stream: MediaStream, onSamples: (samples: Float32Array) => void): Promise<() => void> {
  if (context.audioWorklet && typeof AudioWorkletNode !== 'undefined') {
    let worklet: AudioWorkletNode | undefined;
    let source: MediaStreamAudioSourceNode | undefined;
    const moduleUrl = URL.createObjectURL(new Blob([WORKLET_SOURCE], { type: 'text/javascript' }));
    try {
      await context.audioWorklet.addModule(moduleUrl);
      if (context.state === 'closed') throw new Error('Audio capture was cancelled');
      worklet = new AudioWorkletNode(context, 'xiaox-pcm-capture', { numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [1] });
      source = context.createMediaStreamSource(stream);
      worklet.port.onmessage = event => { if (event.data instanceof Float32Array) onSamples(event.data); };
      source.connect(worklet);
      // The processor emits silence; connecting it keeps audio processing alive.
      worklet.connect(context.destination);
      return () => {
        if (worklet) { worklet.port.onmessage = null; worklet.port.close(); worklet.disconnect(); }
        source?.disconnect();
      };
    } catch (error) {
      if (worklet) { worklet.port.onmessage = null; worklet.port.close(); worklet.disconnect(); }
      source?.disconnect();
      if (context.state === 'closed') throw error;
    } finally { URL.revokeObjectURL(moduleUrl); }
  }
  const source = context.createMediaStreamSource(stream);
  const processor = context.createScriptProcessor(2048, 1, 1);
  processor.onaudioprocess = event => {
    onSamples(new Float32Array(event.inputBuffer.getChannelData(0)));
    event.outputBuffer.getChannelData(0).fill(0);
  };
  source.connect(processor);
  processor.connect(context.destination);
  return () => { processor.onaudioprocess = null; source.disconnect(); processor.disconnect(); };
}
