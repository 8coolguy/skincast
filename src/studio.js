import { createAvatar } from "./avatar.js";
import { connect, saveSettings } from "./connection.js";
import { startMicrophone } from "./microphone.js";

const $ = (id) => document.getElementById(id);
const icons = {
  external:
    '<path d="M14 3h7v7M21 3l-9 9"/><path d="M10 3H4a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h16a1 1 0 0 0 1-1v-6"/>',
  user: '<rect x="7" y="3" width="10" height="9" rx="1"/><path d="M5 21v-5a3 3 0 0 1 3-3h8a3 3 0 0 1 3 3v5M9 17v4m6-4v4"/>',
  arrow: '<path d="M5 12h14m-5-5 5 5-5 5"/>',
  upload:
    '<path d="M12 16V3m-5 5 5-5 5 5M4 15v5a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-5"/>',
  cursor: '<path d="m4 3 5 18 4-8 8-4L4 3z"/>',
  reset: '<path d="M3 10a9 9 0 1 1 2 8M3 4v6h6"/>',
  layers: '<path d="m12 3 9 5-9 5-9-5 9-5zm-9 9 9 5 9-5m-18 5 9 5 9-5"/>',
  portrait:
    '<rect x="4" y="3" width="16" height="18" rx="2"/><rect x="9" y="7" width="6" height="6"/><path d="M7 19v-2a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v2"/>',
  zoom: '<circle cx="10" cy="10" r="6"/><path d="m15 15 6 6M7 10h6m-3-3v6"/>',
  mic: '<rect x="8" y="2" width="8" height="13" rx="4"/><path d="M5 10v2a7 7 0 0 0 14 0v-2m-7 9v3m-4 0h8"/>',
  shield:
    '<path d="m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6l8-3z"/><path d="m9 12 2 2 4-5"/>',
  image:
    '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8" cy="8" r="1.5"/><path d="m3 17 5-5 4 4 4-6 5 7"/>',
  transparent: '<path d="m4 20 16-16M4 4h16v16H4z"/>',
  broadcast:
    '<path d="M8 5a9 9 0 0 0 0 14m8-14a9 9 0 0 1 0 14M10 8a5 5 0 0 0 0 8m4-8a5 5 0 0 1 0 8"/><circle cx="12" cy="12" r="1"/>',
  copy: '<rect x="8" y="8" width="12" height="13" rx="2"/><path d="M16 8V3H3v13h5"/>',
  chevron: '<path d="m6 9 6 6 6-6"/>',
};
document.querySelectorAll("[data-icon]").forEach((el) => {
  el.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true">${icons[el.dataset.icon] || ""}</svg>`;
});
$("overlay-url").value = `${location.origin}/overlay`;
let settings;
let voice = { level: 0, connected: false };
let stopMic;
let previewTracking = false;
let lastPointer = { x: 0, y: 0 };
let toastTimer;
let avatar;
let faceSource;
let faceVersion = 0;
let micBusy = false;
let serverConnected = false;

function toast(message, error = false) {
  clearTimeout(toastTimer);
  $("toast").textContent = message;
  $("toast").classList.toggle("error", error);
  $("toast").hidden = false;
  toastTimer = setTimeout(
    () => {
      $("toast").hidden = true;
    },
    error ? 8000 : 3200,
  );
}

try {
  avatar = createAvatar($("avatar"), (message) => {
    $("avatar-error").textContent = message || "";
    $("avatar-error").hidden = !message;
    $("skin-status").textContent = message
      ? "Skin could not be loaded"
      : settings?.skinSource.startsWith("data:")
        ? "Custom skin · ready to stream"
        : "Skin loaded · ready to stream";
  });
} catch {
  $("avatar-error").textContent =
    "3D rendering is unavailable. Enable hardware acceleration in your browser, then reload.";
  $("avatar-error").hidden = false;
}

function rangeOutput(element) {
  const value = Number(element.value);
  const output = $(`${element.id}-value`);
  if (output)
    output.value = `${Math.round((value / (element.id === "zoom" ? 0.9 : 1)) * 100)}%`;
  element.style.setProperty(
    "--progress",
    `${((value - Number(element.min)) / (Number(element.max) - Number(element.min))) * 100}%`,
  );
}

async function updateFace(source) {
  if (faceSource === source) return;
  faceSource = source;
  const version = ++faceVersion;
  try {
    const response = await fetch(source);
    if (!response.ok) return;
    const image = await createImageBitmap(await response.blob());
    if (version !== faceVersion) {
      image.close();
      return;
    }
    const context = $("skin-face").getContext("2d");
    const scale = image.width / 64;
    context.clearRect(0, 0, 8, 8);
    context.drawImage(
      image,
      8 * scale,
      8 * scale,
      8 * scale,
      8 * scale,
      0,
      0,
      8,
      8,
    );
    context.drawImage(
      image,
      40 * scale,
      8 * scale,
      8 * scale,
      8 * scale,
      0,
      0,
      8,
      8,
    );
    image.close();
  } catch {
    faceSource = null;
  }
}

function renderSettings(next) {
  settings = next;
  avatar?.configure(settings);
  document.querySelectorAll("[data-setting]").forEach((el) => {
    if (document.activeElement === el && el.type === "range") return;
    if (el.type === "checkbox") el.checked = settings[el.dataset.setting];
    else el.value = settings[el.dataset.setting];
    if (el.type === "range") rangeOutput(el);
  });
  if (document.activeElement !== $("username"))
    $("username").value = settings.username;
  $("skin-name").textContent = settings.skinSource.startsWith("data:")
    ? "Custom skin"
    : settings.username;
  updateFace(settings.skinSource);
  document.querySelectorAll("[data-framing]").forEach((el) => {
    const active = el.dataset.framing === settings.framing;
    el.classList.toggle("active", active);
    el.setAttribute("aria-pressed", active);
  });
  document.querySelectorAll("[data-background]").forEach((el) => {
    const active = el.dataset.background === settings.background;
    el.classList.toggle("active", active);
    el.setAttribute("aria-pressed", active);
  });
  $("color-options").hidden = settings.background !== "color";
  $("upload-background").hidden = settings.background !== "image";
  $("background-hex").textContent = settings.backgroundColor.toUpperCase();
  document.querySelector(".solid-sample").style.backgroundColor =
    settings.backgroundColor;
  $("preview-scene").classList.toggle(
    "checkerboard",
    settings.background === "transparent",
  );
  $("background-label").textContent = {
    transparent: "Transparent background",
    color: "Solid background",
    image: "Image background",
  }[settings.background];
  $("background-help").textContent = {
    transparent: "The checkerboard stays out of your stream.",
    color: "Your color fills the entire OBS source.",
    image: "The image fills the source and crops to fit.",
  }[settings.background];
  $("threshold-marker").style.left = `${settings.threshold * 100}%`;
  updateVoice();
}

async function save(patch) {
  $("save-status").textContent = "Saving…";
  try {
    const saved = await saveSettings(patch);
    renderSettings(saved);
    $("save-status").textContent = "All changes saved";
    return saved;
  } catch (err) {
    $("save-status").textContent = "Changes could not be saved";
    toast(err.message || "Could not reach the local server.", true);
    try {
      const response = await fetch("/api/state");
      if (response.ok) renderSettings((await response.json()).settings);
    } catch {
      /* The connection banner reports the unavailable server. */
    }
    return null;
  }
}

function updateVoice() {
  avatar?.setInput(voice);
  const speaking =
    settings && voice.connected && voice.level > settings.threshold;
  const percent = Math.round(voice.level * 100);
  $("meter-fill").style.width = `${percent}%`;
  $("audio-meter").setAttribute("aria-valuenow", percent);
  $("level-value").textContent = `${percent}%`;
  $("voice-state").textContent = speaking
    ? "Speaking"
    : voice.connected
      ? "Listening"
      : "Mic is off";
  $("voice-pill").classList.toggle("speaking", !!speaking);
  $("mic-tag").textContent = voice.connected ? "LIVE" : "OFF";
  $("mic-tag").classList.toggle("live", voice.connected);
}

function renderMicButton() {
  $("mic-toggle-label").textContent = stopMic
    ? "Disable microphone"
    : "Enable microphone";
  $("mic-toggle").disabled = micBusy;
  $("microphone").disabled = micBusy;
}

const connection = connect(
  (message) => {
    if (message.type === "state") {
      renderSettings(message.settings);
      voice = message.voice;
      lastPointer = message.pointer;
      avatar?.setInput({ ...lastPointer, ...voice });
      updateVoice();
      updateTracking(message.tracking);
    }
    if (message.type === "settings") renderSettings(message.settings);
    if (message.type === "pointer") {
      lastPointer = { x: message.x, y: message.y };
      if (!previewTracking) avatar?.setInput(lastPointer);
    }
    if (message.type === "tracking") updateTracking(message.tracking);
    if (message.type === "voice") {
      voice = { level: message.level, connected: message.connected };
      updateVoice();
    }
    if (message.type === "mic-busy") {
      disableMic(false);
      toast(message.message, true);
    }
    if (message.type === "error") toast(message.message, true);
  },
  (connected) => {
    serverConnected = connected;
    $("connection").classList.toggle("online", connected);
    $("connection-text").textContent = connected
      ? "Studio connected"
      : "Reconnecting…";
    if (connected && stopMic) connection.send({ type: "voice-start" });
    if (!connected) {
      voice = { level: 0, connected: false };
      updateVoice();
      avatar?.setInput({ x: 0, y: 0 });
    }
  },
);

function updateTracking(tracking) {
  $("tracking-status").classList.toggle("online", tracking.connected);
  $("tracking-text").textContent = tracking.connected
    ? `Desktop tracking · ${tracking.message}`
    : tracking.message;
  $("tracking-status").title = tracking.message;
  if (!tracking.connected && !previewTracking) {
    lastPointer = { x: 0, y: 0 };
    avatar?.setInput(lastPointer);
  }
}

document.querySelectorAll("[data-setting]").forEach((el) => {
  if (el.type === "range")
    el.addEventListener("input", () => {
      if (!settings) return;
      settings = { ...settings, [el.dataset.setting]: Number(el.value) };
      avatar?.configure(settings);
      rangeOutput(el);
      if (el.id === "threshold") {
        $("threshold-marker").style.left = `${Number(el.value) * 100}%`;
        updateVoice();
      }
    });
  el.addEventListener("change", () =>
    save({
      [el.dataset.setting]:
        el.type === "checkbox"
          ? el.checked
          : el.type === "range"
            ? Number(el.value)
            : el.value,
    }),
  );
});
document
  .querySelectorAll("[data-framing]")
  .forEach((el) =>
    el.addEventListener("click", () => save({ framing: el.dataset.framing })),
  );
document.querySelectorAll("[data-background]").forEach((el) =>
  el.addEventListener("click", () => {
    if (el.dataset.background === "image" && !settings?.backgroundImage)
      $("background-file").click();
    else save({ background: el.dataset.background });
  }),
);
$("reset-view").addEventListener("click", () =>
  save({ zoom: 0.9, framing: "full" }),
);
$("skin-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const username = $("username").value.trim();
  if (!/^[a-z\d_]{1,16}$/i.test(username))
    return toast(
      "Use a Minecraft username with 1–16 letters, numbers, or underscores.",
      true,
    );
  const button = $("skin-form").querySelector("button");
  button.disabled = true;
  $("skin-status").textContent = "Looking up Minecraft skin…";
  try {
    const response = await fetch(`/api/skin/${username}?refresh=1`);
    if (!response.ok) throw new Error((await response.json()).error);
    faceSource = null;
    if (
      await save({
        username,
        skinSource: `/api/skin/${username}?v=${Date.now()}`,
      })
    )
      toast(`Loaded ${username}’s skin.`);
  } catch (err) {
    toast(err.message, true);
    $("skin-status").textContent = "Lookup failed. Try a PNG upload.";
  } finally {
    button.disabled = false;
  }
});

function readFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error("File could not be read."));
    reader.readAsDataURL(file);
  });
}
async function checkImage(file, skin = false) {
  if (!file) return;
  if (
    !(
      skin ? ["image/png"] : ["image/png", "image/jpeg", "image/webp"]
    ).includes(file.type)
  )
    throw new Error(
      skin ? "Choose a PNG skin." : "Choose a PNG, JPG, or WebP image.",
    );
  if (file.size > (skin ? 1_500_000 : 6_000_000))
    throw new Error(
      skin
        ? "Skin must be smaller than 1.5 MB."
        : "Background must be smaller than 6 MB.",
    );
  const image = await createImageBitmap(file);
  const valid =
    image.width >= 64 &&
    image.width <= 1024 &&
    image.width % 64 === 0 &&
    (image.height === image.width || image.height === image.width / 2);
  image.close();
  if (skin && !valid)
    throw new Error(
      "Use a 64 × 64 or 64 × 32 Minecraft skin, or an HD multiple up to 1024 px.",
    );
  return readFile(file);
}
$("upload-skin").addEventListener("click", () => $("skin-file").click());
$("skin-file").addEventListener("change", async (event) => {
  try {
    const source = await checkImage(event.target.files[0], true);
    if (source && (await save({ skinSource: source })))
      toast("Custom skin loaded.");
  } catch (err) {
    toast(err.message, true);
  }
  event.target.value = "";
});
$("upload-background").addEventListener("click", () =>
  $("background-file").click(),
);
$("background-file").addEventListener("change", async (event) => {
  try {
    const image = await checkImage(event.target.files[0]);
    if (image && (await save({ background: "image", backgroundImage: image })))
      toast("Background updated.");
  } catch (err) {
    toast(err.message, true);
  }
  event.target.value = "";
});

async function listDevices() {
  try {
    const devices = (await navigator.mediaDevices.enumerateDevices()).filter(
      (device) => device.kind === "audioinput",
    );
    const current = $("microphone").value;
    $("microphone").replaceChildren(new Option("Default microphone", ""));
    devices.forEach((device, i) => {
      if (device.deviceId !== "default")
        $("microphone").add(
          new Option(device.label || `Microphone ${i + 1}`, device.deviceId),
        );
    });
    if (devices.some((device) => device.deviceId === current))
      $("microphone").value = current;
  } catch {
    /* Device names appear after the user grants access. */
  }
}
function disableMic(notify = true) {
  stopMic?.();
  stopMic = null;
  if (notify) connection.send({ type: "voice-stop" });
  renderMicButton();
}
async function enableMic() {
  if (!serverConnected)
    return toast(
      "Wait for the local server to reconnect before enabling the microphone.",
      true,
    );
  micBusy = true;
  renderMicButton();
  try {
    stopMic = await startMicrophone(
      $("microphone").value,
      (level) => {
        if (!voice.connected) connection.send({ type: "voice-start" });
        connection.send({ type: "voice", level });
      },
      () => {
        disableMic();
        toast("Microphone disconnected. Connect it and enable it again.", true);
      },
    );
    connection.send({ type: "voice-start" });
    await listDevices();
  } catch (err) {
    toast(err.message, true);
  } finally {
    micBusy = false;
    renderMicButton();
  }
}
$("mic-toggle").addEventListener("click", () =>
  stopMic ? disableMic() : enableMic(),
);
$("microphone").addEventListener("change", async () => {
  if (stopMic) {
    disableMic();
    await enableMic();
  }
});
navigator.mediaDevices?.addEventListener("devicechange", listDevices);
listDevices();

$("preview-track").addEventListener("click", () => {
  previewTracking = !previewTracking;
  $("preview-track").setAttribute("aria-pressed", previewTracking);
  $("preview-track").textContent = previewTracking
    ? "Use desktop tracking"
    : "Preview tracking";
  $("preview-note-text").textContent = previewTracking
    ? "Move your mouse inside this preview."
    : "Move your mouse anywhere on your screen.";
  if (!previewTracking) avatar?.setInput(lastPointer);
});
$("preview-scene").addEventListener("pointermove", (event) => {
  if (!previewTracking) return;
  const rect = $("preview-scene").getBoundingClientRect();
  avatar?.setInput({
    x: ((event.clientX - rect.left) / rect.width) * 2 - 1,
    y: ((event.clientY - rect.top) / rect.height) * 2 - 1,
  });
});
$("preview-scene").addEventListener("pointerleave", () => {
  if (previewTracking) avatar?.setInput({ x: 0, y: 0 });
});
$("copy-url").addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText($("overlay-url").value);
    $("copy-label").textContent = "Copied";
    setTimeout(() => {
      $("copy-label").textContent = "Copy URL";
    }, 2000);
  } catch {
    $("overlay-url").select();
    toast("Select and copy the highlighted overlay URL.");
  }
});
$("setup-toggle").addEventListener("click", () => {
  const expanded = $("setup-toggle").getAttribute("aria-expanded") !== "true";
  $("setup-toggle").setAttribute("aria-expanded", expanded);
  $("setup-guide").hidden = !expanded;
});
window.addEventListener("pagehide", () => {
  disableMic();
  connection.dispose();
  avatar?.dispose();
});
