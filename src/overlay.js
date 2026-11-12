import { createAvatar } from "./avatar.js";
import { connect } from "./connection.js";

const error = document.querySelector("#overlay-error");
const stage = document.querySelector("#avatar");
try {
  const avatar = createAvatar(stage, (message) => {
    error.textContent = message || "";
    error.hidden = !message;
  });
  const connection = connect(
    (message) => {
      if (message.type === "state") {
        avatar.configure(message.settings);
        avatar.setInput({ ...message.pointer, ...message.voice });
        avatar.setPerformance(message.play);
        avatar.setMinecraft(message.minecraft);
      }
      if (message.type === "minecraft") avatar.setMinecraft(message.minecraft);
      if (message.type === "settings") avatar.configure(message.settings);
      if (message.type === "play") avatar.setPerformance(message.play);
      if (message.type === "pointer")
        avatar.setInput({
          x: message.x,
          y: message.y,
          gameX: message.gameX,
          gameY: message.gameY,
          relativeAvailable: message.relativeAvailable,
        });
      if (message.type === "voice")
        avatar.setInput({ level: message.level, connected: message.connected });
      if (message.type === "tracking" && !message.tracking.connected)
        avatar.setInput({ x: 0, y: 0, relativeAvailable: false });
    },
    (connected) => {
      document.body.dataset.connected = String(connected);
      if (!connected) {
        avatar.setMinecraft({ active: false });
        avatar.setInput({
          x: 0,
          y: 0,
          relativeAvailable: false,
          level: 0,
          connected: false,
        });
        error.textContent = "Reconnecting to Skincast…";
        error.hidden = false;
      } else {
        error.hidden = true;
      }
    },
  );
  window.addEventListener("pagehide", () => {
    avatar.dispose();
    connection.dispose();
  });
} catch {
  error.textContent =
    "3D rendering is unavailable. Enable browser hardware acceleration and refresh this source.";
  error.hidden = false;
}
