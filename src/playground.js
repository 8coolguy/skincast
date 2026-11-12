export function createPlayground(
  send,
  save,
  onLook = () => {},
  onSwing = () => {},
) {
  const stage = document.getElementById("preview-scene");
  const control = document.getElementById("take-control");
  const held = new Set();
  let owned = false;
  let online = false;
  let mode = "avatar";
  let shared = false;
  let yaw = -Math.PI,
    pitch = -0.55,
    epoch = 0;
  let wasLocked = false;
  const isLocked = () => document.pointerLockElement === stage;
  let dragLook = false;
  let drag = null;
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
  const avatarShortcuts = {
    Digit1: "wave",
    Digit2: "dance",
    Digit3: "spin",
    Digit4: "cheer",
    Space: "jump",
    KeyE: "place",
    KeyQ: "remove",
  };
  const gameShortcuts = {
    Digit4: "wave",
    Digit5: "dance",
    Digit6: "spin",
    Digit7: "cheer",
    Space: "jump",
    KeyE: "place",
    KeyQ: "remove",
  };
  const palette = ["grass", "stone", "wood"];
  const chooseBlock = (value) => {
    document.getElementById("block-type").value = value;
    document
      .querySelectorAll("[data-block]")
      .forEach((button) =>
        button.classList.toggle("active", button.dataset.block === value),
      );
  };
  const input = () => {
    if (!owned || !online) return;
    const active =
      document.hasFocus() &&
      document.activeElement === stage &&
      (isLocked() || dragLook || held.size > 0);
    send({
      type: "game-input",
      x: Number(held.has("right")) - Number(held.has("left")),
      z: Number(held.has("down")) - Number(held.has("up")),
      sprint: held.has("sprint"),
      yaw,
      pitch,
      active,
    });
  };
  const look = (dx, dy) => {
    yaw =
      ((((yaw - dx * 0.003 + Math.PI) % (Math.PI * 2)) + Math.PI * 2) %
        (Math.PI * 2)) -
      Math.PI;
    pitch = Math.max(-1.3, Math.min(1.3, pitch - dy * 0.003));
    onLook({ yaw, pitch });
    input();
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
    stage.classList.toggle("pointer-locked", isLocked());
    const prompt = document.getElementById("pov-prompt");
    prompt.hidden = mode !== "sandbox" || isLocked() || dragLook;
    document.getElementById("enter-first-person").disabled =
      !online || (shared && !owned);
    document.getElementById("enter-first-person").textContent =
      shared && !owned
        ? "Controlled in another tab"
        : owned
          ? "Resume first person"
          : "Click to play";
    document.querySelectorAll("button[data-action]").forEach((button) => {
      button.disabled =
        !online ||
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
    if (action === "reset") {
      yaw = -Math.PI;
      pitch = -0.55;
      held.clear();
      onLook({ yaw, pitch });
    }
    input();
    send({
      type: "game-command",
      action,
      blockType: document.getElementById("block-type").value,
    });
    if (["place", "remove"].includes(action)) onSwing();
  };
  const unlock = () => {
    if (document.pointerLockElement === stage) document.exitPointerLock();
  };
  const stopControl = () => {
    release();
    if (owned) send({ type: "control-stop" });
    unlock();
  };
  const capture = () => {
    if (!online || (shared && !owned)) return;
    stage.focus({ preventScroll: true });
    stage.scrollIntoView({ block: "center", behavior: "instant" });
    if (!owned) send({ type: "control-start" });
    const fallback = (error) => {
      stage.dataset.captureError =
        error?.message || "Mouse capture is unavailable.";
      dragLook = true;
      document.getElementById("pov-prompt-help").textContent =
        "Mouse capture was unavailable. Drag inside the view to look around.";
      document.getElementById("preview-note-text").textContent =
        "Drag to look · WASD move · E build · Q remove · Escape pause";
      render();
    };
    if (stage.requestPointerLock) {
      try {
        const pending = stage.requestPointerLock();
        pending?.catch(fallback);
      } catch {
        fallback();
      }
    } else fallback();
  };
  const fullscreen = () => {
    const operation =
      document.fullscreenElement === stage
        ? document.exitFullscreen()
        : stage.requestFullscreen?.();
    operation?.catch(() => {
      document.getElementById("pov-prompt-help").textContent =
        "Fullscreen is unavailable in this browser. You can still play in this view.";
    });
  };
  document
    .querySelectorAll("button[data-stage]")
    .forEach((button) =>
      button.addEventListener("click", () =>
        save({ stageMode: button.dataset.stage }),
      ),
    );
  document.querySelectorAll("button[data-action]").forEach((button) =>
    button.addEventListener("click", () => {
      command(button.dataset.action);
      if (owned) stage.focus({ preventScroll: true });
    }),
  );
  control.addEventListener("click", () => {
    if (owned) stopControl();
    else capture();
  });
  document
    .getElementById("enter-first-person")
    .addEventListener("click", capture);
  document
    .getElementById("pov-fullscreen")
    .addEventListener("click", fullscreen);
  document
    .querySelectorAll("[data-block]")
    .forEach((button) =>
      button.addEventListener("click", () => chooseBlock(button.dataset.block)),
    );
  document
    .getElementById("block-type")
    .addEventListener("change", (event) => chooseBlock(event.target.value));
  document.addEventListener("pointerlockchange", () => {
    const current = isLocked();
    if (wasLocked && !current) {
      dragLook = false;
      release();
    }
    wasLocked = current;
    render();
  });
  document.addEventListener("pointerlockerror", () => {
    document.getElementById("pov-prompt-help").textContent =
      "Mouse capture was unavailable. Drag inside the view to look around.";
  });
  document.addEventListener("mousemove", (event) => {
    if (owned && isLocked()) look(event.movementX, event.movementY);
  });
  document.addEventListener("mousedown", (event) => {
    if (!owned || !isLocked()) return;
    event.preventDefault();
    if (event.button === 0) command("remove");
    if (event.button === 2) command("place");
  });
  document.addEventListener("contextmenu", (event) => {
    if (isLocked()) event.preventDefault();
  });
  document.addEventListener(
    "pointerdown",
    (event) => {
      if (isLocked()) event.stopPropagation();
    },
    true,
  );
  document.addEventListener(
    "click",
    (event) => {
      if (isLocked()) {
        event.preventDefault();
        event.stopPropagation();
      }
    },
    true,
  );
  stage.addEventListener("pointerdown", (event) => {
    if (mode !== "sandbox" || event.target.closest("button")) return;
    if (isLocked() && owned) {
      return;
    }
    if (event.pointerType === "touch" || (owned && !isLocked())) {
      event.preventDefault();
      stage.focus({ preventScroll: true });
      if (!owned && !shared) send({ type: "control-start" });
      drag = { x: event.clientX, y: event.clientY };
      dragLook = true;
      stage.setPointerCapture(event.pointerId);
      render();
    } else capture();
  });
  stage.addEventListener("pointermove", (event) => {
    if (!drag || !owned) return;
    look(event.clientX - drag.x, event.clientY - drag.y);
    drag = { x: event.clientX, y: event.clientY };
  });
  for (const name of ["pointerup", "pointercancel", "lostpointercapture"])
    stage.addEventListener(name, () => {
      if (drag) {
        drag = null;
        render();
      }
    });
  stage.addEventListener("contextmenu", (event) => {
    if (mode === "sandbox") event.preventDefault();
  });
  stage.addEventListener(
    "wheel",
    (event) => {
      if (!isLocked() || !owned) return;
      event.preventDefault();
      const current = palette.indexOf(
        document.getElementById("block-type").value,
      );
      chooseBlock(palette[(current + (event.deltaY > 0 ? 1 : 2)) % 3]);
    },
    { passive: false },
  );
  stage.addEventListener("keydown", (event) => {
    if (event.target !== stage) return;
    const direction = movement[event.code];
    const action = (mode === "sandbox" ? gameShortcuts : avatarShortcuts)[
      event.code
    ];
    if (mode === "sandbox" && /^Digit[1-3]$/.test(event.code)) {
      event.preventDefault();
      chooseBlock(palette[Number(event.code.slice(-1)) - 1]);
    }
    if (mode === "sandbox" && event.code === "KeyF") {
      event.preventDefault();
      fullscreen();
    }
    if (direction && owned && (isLocked() || dragLook)) {
      event.preventDefault();
      held.add(direction);
      input();
    }
    if (event.code.startsWith("Shift") && owned && (isLocked() || dragLook))
      held.add("sprint");
    if (
      action &&
      !event.repeat &&
      (mode === "avatar" || (owned && (isLocked() || dragLook)))
    ) {
      event.preventDefault();
      command(action);
    }
    if (event.code === "Escape" && owned) {
      dragLook = false;
      unlock();
      release();
      render();
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
        dragLook = false;
        unlock();
        onLook(null);
      }
      mode = settings.stageMode;
      stage.classList.toggle("first-person", mode === "sandbox");
      document.getElementById("pov-hud").hidden = mode !== "sandbox";
      document.getElementById("preview-track").hidden = mode === "sandbox";
      document.getElementById("preview-dimensions").textContent =
        mode === "sandbox" ? "FIRST PERSON" : "800 × 800";
      if (mode === "sandbox") {
        document.getElementById("background-label").textContent =
          "First person · OBS stays third person";
        document.getElementById("preview-note-text").textContent =
          "Click to look around · WASD move · left click remove · right click build · Esc pause";
      } else
        document.getElementById("preview-note-text").textContent =
          document
            .getElementById("preview-track")
            .getAttribute("aria-pressed") === "true"
            ? "Move your mouse inside this preview."
            : "Move your mouse anywhere on your screen.";
      document.getElementById("sandbox-tools").hidden = mode !== "sandbox";
      document.querySelectorAll("button[data-stage]").forEach((button) => {
        const active = button.dataset.stage === mode;
        button.classList.toggle("active", active);
        button.setAttribute("aria-pressed", active);
      });
      document.querySelectorAll("button[data-framing]").forEach((button) => {
        button.disabled = mode === "sandbox";
      });
      const shortcuts =
        mode === "sandbox"
          ? { wave: 4, dance: 5, spin: 6, cheer: 7 }
          : { wave: 1, dance: 2, spin: 3, cheer: 4 };
      document
        .querySelectorAll(".action-buttons button[data-action] kbd")
        .forEach((key) => {
          const action = key.parentElement.dataset.action;
          if (shortcuts[action]) key.textContent = shortcuts[action];
        });
      render();
    },
    update(state) {
      if (!owned || epoch !== state.epoch) {
        yaw = state.heading - Math.PI;
        pitch = state.pitch;
        onLook(owned ? { yaw, pitch } : null);
      }
      epoch = state.epoch;
      const changed = shared !== state.controlled;
      shared = state.controlled;
      if (!shared) {
        owned = false;
        held.clear();
      }
      const text = state.action
        ? `${state.action.name[0].toUpperCase()}${state.action.name.slice(1)}`
        : owned
          ? "You're in control"
          : "Ready to play";
      const status = document.getElementById("action-status");
      if (status.textContent !== text) status.textContent = text;
      const count = document.getElementById("block-count"),
        label = `${state.blocks.length} / 49 blocks`;
      if (count.textContent !== label) count.textContent = label;
      const target = document.getElementById("pov-target");
      const targetText = state.target
        ? `${state.target.kind === "block" ? state.target.type : "Island ground"} · ${state.target.x}, ${state.target.z}`
        : "Aim at the island or a block";
      if (target.textContent !== targetText) target.textContent = targetText;
      if (changed) render();
    },
    control(value) {
      owned = value;
      shared = value;
      held.clear();
      onLook(owned ? { yaw, pitch } : null);
      if (!owned) unlock();
      if (!owned) dragLook = false;
      render();
      if (owned) {
        input();
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
        onLook(null);
        unlock();
      }
      render();
    },
    dispose() {
      stopControl();
      clearInterval(heartbeat);
    },
  };
}
