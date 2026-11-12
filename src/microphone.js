export async function startMicrophone(deviceId, onLevel, onEnded) {
  if (!navigator.mediaDevices?.getUserMedia)
    throw new Error(
      "Open the studio in Chrome, Edge, or Firefox on localhost to use a microphone.",
    );
  let stream;
  let context;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        ...(deviceId ? { deviceId: { exact: deviceId } } : {}),
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: false,
      },
      video: false,
    });
    context = new AudioContext();
    await context.resume();
    await context.audioWorklet.addModule("/audio-meter.js");
    const source = context.createMediaStreamSource(stream);
    const meter = new AudioWorkletNode(context, "audio-meter");
    const silent = context.createGain();
    silent.gain.value = 0;
    source.connect(meter).connect(silent).connect(context.destination);
    meter.port.onmessage = (event) => onLevel(event.data);
    let stopped = false;
    const stop = () => {
      if (stopped) return;
      stopped = true;
      meter.port.onmessage = null;
      stream.getTracks().forEach((track) => track.stop());
      source.disconnect();
      meter.disconnect();
      silent.disconnect();
      context.close();
    };
    for (const track of stream.getTracks())
      track.addEventListener("ended", () => {
        stop();
        onEnded();
      });
    return stop;
  } catch (err) {
    stream?.getTracks().forEach((track) => track.stop());
    if (context && context.state !== "closed") await context.close();
    if (err.name === "NotAllowedError")
      throw new Error(
        "Microphone access was blocked. Allow it in your browser’s site settings, then try again.",
      );
    if (err.name === "NotFoundError")
      throw new Error("No microphone was found. Connect one and try again.");
    throw err;
  }
}
