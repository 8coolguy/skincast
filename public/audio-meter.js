class AudioMeter extends AudioWorkletProcessor {
  constructor() { super(); this.samples = 0; this.sum = 0; }
  process(inputs) {
    const channels = inputs[0];
    if (channels.length) {
      const input = channels[0];
      for (let i = 0; i < input.length; i++) this.sum += input[i] * input[i];
      this.samples += input.length;
      if (this.samples >= sampleRate / 30) {
        this.port.postMessage(Math.min(1, Math.sqrt(this.sum / this.samples) * 3));
        this.samples = 0; this.sum = 0;
      }
    }
    return true;
  }
}
registerProcessor('audio-meter', AudioMeter);
