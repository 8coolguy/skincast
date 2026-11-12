export function createPlayground(send, save) {
  const stage = document.getElementById("preview-scene");
  const control = document.getElementById("take-control");
  const held = new Set();
  let owned = false;
  let online = false;
  let mode = "avatar";
  let minecraftMotion = false;
  let shared = false;
  const movement = {
    KeyW: "up",
    ArrowUp: "up",
    KeyS: "down",
    ArrowDown: "down",
    KeyA: "left",
    ArrowLeft: "left",
    KeyD: "right",
    ArrowRight: "right",
  };
  const shortcuts = {
    Digit1: "wave",
    Digit2: "dance",
    Digit3: "spin",
    Digit4: "cheer",
    Space: "jump",
    KeyE: "place",
    KeyQ: "remove",
  };
  const input = () => {
    if (!owned || !online) return;
    send({
      type: "game-input",
      x: Number(held.has("right")) - Number(held.has("left")),
      z: Number(held.has("down")) - Number(held.has("up")),
      sprint: held.has("sprint"),
    });
  };
  const release = () => {
    held.clear();
    input();
  };
  const render = () => {
    const label = owned
      ? "Release control"
      : shared
        ? "Controlled in another tab"
        : "Take control";
    if (control.textContent !== label) control.textContent = label;
    control.setAttribute("aria-pressed", owned);
    control.disabled = !online || (shared && !owned);
    stage.classList.toggle("controlled", owned);
    document.querySelectorAll("[data-action]").forEach((button) => {
      button.disabled =
        !online ||
        minecraftMotion ||
        (shared && !owned) ||
        (mode === "sandbox" &&
          ["jump", "place", "remove", "reset"].includes(
            button.dataset.action,
          ) &&
          !owned);
    });
    document.querySelectorAll("[data-move]").forEach((button) => {
      button.disabled = !owned || !online;
    });
  };
  const command = (action) => {
    if (minecraftMotion) return;
    send({
      type: "game-command",
      action,
      blockType: document.getElementById("block-type").value,
    });
  };
  document
    .querySelectorAll("[data-stage]")
    .forEach((button) =>
      button.addEventListener("click", () =>
        save({ stageMode: button.dataset.stage }),
      ),
    );
  document.querySelectorAll("[data-action]").forEach((button) =>
    button.addEventListener("click", () => {
      command(button.dataset.action);
      if (owned) stage.focus({ preventScroll: true });
    }),
  );
  control.addEventListener("click", () => {
    release();
    send({ type: owned ? "control-stop" : "control-start" });
  });
  stage.addEventListener("keydown", (event) => {
    if (event.target !== stage) return;
    const direction = movement[event.code];
    const action = shortcuts[event.code];
    if (direction && owned) {
      event.preventDefault();
      held.add(direction);
      input();
    }
    if (event.code.startsWith("Shift") && owned) held.add("sprint");
    if (action && !event.repeat && (mode === "avatar" || owned)) {
      event.preventDefault();
      command(action);
    }
    if (event.code === "Escape" && owned) {
      release();
      send({ type: "control-stop" });
    }
  });
  stage.addEventListener("keyup", (event) => {
    if (movement[event.code]) {
      held.delete(movement[event.code]);
      if (owned) event.preventDefault();
      input();
    }
    if (event.code.startsWith("Shift")) held.delete("sprint");
  });
  stage.addEventListener("blur", release);
  window.addEventListener("blur", release);
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) release();
  });
  document.querySelectorAll("[data-move]").forEach((button) => {
    button.addEventListener("pointerdown", (event) => {
      if (!owned) return;
      event.preventDefault();
      stage.focus({ preventScroll: true });
      button.setPointerCapture(event.pointerId);
      held.add(button.dataset.move);
      input();
    });
    for (const name of ["pointerup", "pointercancel", "lostpointercapture"])
      button.addEventListener(name, () => {
        held.delete(button.dataset.move);
        input();
      });
  });
  const heartbeat = setInterval(input, 100);
  render();
  return {
    configure(settings) {
      if (mode !== settings.stageMode) {
        owned = false;
        shared = false;
        held.clear();
      }
      mode = settings.stageMode;
      minecraftMotion =
        mode === "avatar" && settings.motionSource === "minecraft";
      document.getElementById("sandbox-tools").hidden = mode !== "sandbox";
      document.querySelectorAll("[data-stage]").forEach((button) => {
        const active = button.dataset.stage === mode;
        button.classList.toggle("active", active);
        button.setAttribute("aria-pressed", active);
      });
      document.querySelectorAll("[data-framing]").forEach((button) => {
        button.disabled = mode === "sandbox";
      });
      render();
    },
    update(state) {
      const changed = shared !== state.controlled;
      shared = state.controlled;
      if (!shared) {
        owned = false;
        held.clear();
      }
      const text = minecraftMotion
        ? "Minecraft controls the avatar"
        : state.action
          ? `${state.action.name[0].toUpperCase()}${state.action.name.slice(1)}`
          : owned
            ? "You're in control"
            : "Ready to play";
      const status = document.getElementById("action-status");
      if (status.textContent !== text) status.textContent = text;
      const count = document.getElementById("block-count"),
        label = `${state.blocks.length} / 49 blocks`;
      if (count.textContent !== label) count.textContent = label;
      if (changed) render();
    },
    control(value) {
      owned = value;
      shared = value;
      held.clear();
      render();
      if (owned) {
        stage.focus({ preventScroll: true });
        stage.scrollIntoView({ block: "center", behavior: "instant" });
      }
    },
    connection(value) {
      online = value;
      if (!online) {
        owned = false;
        shared = false;
        held.clear();
      }
      render();
    },
    dispose() {
      release();
      if (owned) send({ type: "control-stop" });
      clearInterval(heartbeat);
    },
  };
}
