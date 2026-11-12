import { SkinViewer } from "skinview3d";
import { MeshBasicMaterial } from "three";
import { createSpeech } from "./speech.js";
import { minecraftPose } from "./minecraft-pose.js";
import { createIsland } from "./island.js";

export function createAvatar(container, onError = () => {}) {
  const canvas = document.createElement("canvas");
  canvas.setAttribute("aria-label", "3D Minecraft avatar");
  container.append(canvas);
  const viewer = new SkinViewer({
    canvas,
    width: container.clientWidth || 600,
    height: container.clientHeight || 600,
    renderPaused: true,
    enableControls: false,
    pixelRatio: Math.min(devicePixelRatio, 2),
    preserveDrawingBuffer: true,
  });
  viewer.controls.enabled = false;
  viewer.globalLight.intensity = 2.8;
  viewer.cameraLight.intensity = 0.7;
  viewer.playerObject.rotation.y = -0.12;
  const skin = viewer.playerObject.skin;
  const material = new MeshBasicMaterial({
    color: "#a6efb4",
    transparent: true,
    opacity: 1,
  });
  const speech = createSpeech(skin.head, material);
  const island = createIsland(viewer.scene);
  let play = {
    x: 0,
    z: 0,
    y: 0,
    heading: 0,
    moving: false,
    action: null,
    blocks: [],
    revision: 0,
  };
  let minecraft = { active: false };
  let minecraftAt = 0;
  let relativeAt = 0;
  let testUntil = 0;
  let settings;
  let input = { x: 0, y: 0, level: 0, connected: false };
  let source = "";
  let loadVersion = 0;
  let x = 0,
    y = 0,
    voice = 0;
  let last = performance.now();
  let frame;
  let disposed = false;
  const resize = () =>
    viewer.setSize(
      Math.max(1, container.clientWidth),
      Math.max(1, container.clientHeight),
    );
  const observer = new ResizeObserver(resize);
  observer.observe(container);
  const render = (now) => {
    if (disposed) return;
    const delta = Math.min((now - last) / 1000, 0.1);
    last = now;
    if (settings) {
      const blend = 1 - Math.pow(settings.smoothing, delta * 60);
      const useMinecraft =
        settings.motionSource === "minecraft" &&
        settings.stageMode === "avatar";
      const liveMinecraft =
        useMinecraft && minecraft.active && now - minecraftAt < 1500;
      const motion = minecraftPose(
        liveMinecraft ? minecraft : { active: false },
      );
      const useRelative =
        settings.motionSource === "relative" && settings.stageMode === "avatar";
      const liveRelative =
        useRelative && input.relativeAvailable && now - relativeAt < 1500;
      const gaze = useMinecraft
        ? motion
        : useRelative
          ? {
              x: liveRelative ? input.gameX : 0,
              y: liveRelative ? input.gameY : 0,
            }
          : input;
      const targetX = settings.tracking ? gaze.x * settings.sensitivity : 0;
      const targetY = settings.tracking ? gaze.y * settings.sensitivity : 0;
      x += (targetX - x) * blend;
      y += (targetY - y) * blend;
      const demo = now < testUntil;
      const level = demo ? 0.35 + Math.sin(now / 110) * 0.15 : input.level;
      const talking = (input.connected || demo) && level > settings.threshold;
      voice +=
        ((talking ? Math.min(1, level * 3 + 0.3) : 0) - voice) *
        (1 - Math.exp(-delta * (talking ? 22 : 1 / settings.voiceRelease)));
      const t = now / 1000;
      const sandbox = settings.stageMode === "sandbox";
      island.update(play, sandbox);
      viewer.playerObject.scale.setScalar(sandbox ? 0.2 : 1);
      skin.head.rotation.set(y * 0.55, x * 0.85, -x * 0.05);
      viewer.playerObject.rotation.set(
        0,
        sandbox ? play.heading : -0.12 + x * 0.23,
        0,
      );
      skin.body.rotation.set(0, 0, -x * 0.045);
      const stride =
        sandbox && play.moving
          ? Math.sin(t * 12) * 0.75
          : liveMinecraft
            ? Math.sin(t * 12) * motion.stride
            : 0;
      skin.leftLeg.rotation.x = stride;
      skin.rightLeg.rotation.x = -stride;
      skin.leftArm.rotation.x = -stride;
      skin.rightArm.rotation.x = stride;
      skin.leftArm.rotation.z =
        -0.055 - (settings.idle ? Math.sin(t * 1.6) * 0.025 : 0) - voice * 0.05;
      skin.rightArm.rotation.z =
        0.055 + (settings.idle ? Math.sin(t * 1.6) * 0.025 : 0) + voice * 0.05;
      const baseY = sandbox ? -4.8 : settings.framing === "portrait" ? -8.5 : 0;
      const bob =
        (settings.idle ? Math.sin(t * 1.8) * 0.17 : 0) +
        voice * Math.abs(Math.sin(t * 12)) * 0.65 * settings.voiceBounce;
      viewer.playerObject.position.set(
        sandbox ? play.x * 4 : 0,
        baseY +
          (useMinecraft ? motion.lift - motion.crouch * 1.8 : play.y * 4) +
          bob * (sandbox ? 0.2 : 1),
        sandbox ? play.z * 4 : 0,
      );
      if (liveMinecraft) {
        skin.body.rotation.x = motion.crouch * 0.3;
        skin.rightArm.rotation.x = motion.usingItem
          ? -1.2
          : -Math.sin(motion.swing * Math.PI) * 1.8 - stride;
        skin.leftLeg.rotation.x += motion.crouch * 0.25;
        skin.rightLeg.rotation.x += motion.crouch * 0.25;
      } else skin.body.rotation.x = 0;
      const action = useMinecraft ? null : play.action;
      if (action?.name === "wave")
        skin.rightArm.rotation.z =
          -2.5 + Math.sin(action.progress * Math.PI * 8) * 0.4;
      if (action?.name === "spin")
        viewer.playerObject.rotation.y += action.progress * Math.PI * 2;
      if (action?.name === "dance") {
        const beat = action.progress * Math.PI * 16;
        skin.body.rotation.z = Math.sin(beat) * 0.18;
        skin.leftArm.rotation.z = 1.1 + Math.sin(beat) * 0.6;
        skin.rightArm.rotation.z = -1.1 + Math.sin(beat) * 0.6;
        skin.leftLeg.rotation.x = Math.sin(beat) * 0.45;
        skin.rightLeg.rotation.x = -Math.sin(beat) * 0.45;
      }
      if (action?.name === "cheer") {
        skin.leftArm.rotation.z = 2.6;
        skin.rightArm.rotation.z = -2.6;
        viewer.playerObject.position.y +=
          Math.abs(Math.sin(action.progress * Math.PI * 4)) *
          (sandbox ? 0.5 : 1.6);
      }
      speech.animate(voice, t, settings);
      container.dataset.motionSource = useMinecraft
        ? "minecraft"
        : useRelative
          ? "relative"
          : "desktop";
      container.dataset.relativeActive = String(!!liveRelative);
      container.dataset.minecraftActive = String(!!liveMinecraft);
      container.dataset.stride = stride.toFixed(3);
      container.dataset.lift = (useMinecraft ? motion.lift : 0).toFixed(3);
      container.dataset.swing = (useMinecraft ? motion.swing : 0).toFixed(3);
      container.dataset.crouch = (useMinecraft ? motion.crouch : 0).toFixed(3);
      container.dataset.speaking = String(talking);
      container.dataset.gazeX = x.toFixed(3);
      container.dataset.gazeY = y.toFixed(3);
      container.dataset.stageMode = settings.stageMode;
      container.dataset.action = action?.name || "idle";
      container.dataset.playerX = play.x.toFixed(3);
      container.dataset.playerZ = play.z.toFixed(3);
      container.dataset.playerY = play.y.toFixed(3);
      container.dataset.blocks = String(play.blocks.length);
      container.dataset.indicatorVisible = String(
        settings.voiceIndicator && voice > 0.025,
      );
    }
    viewer.render();
    frame = requestAnimationFrame(render);
  };
  frame = requestAnimationFrame(render);
  return {
    async configure(next) {
      settings = next;
      const speechBounds = speech.configure(settings);
      container.dataset.indicatorStyle = settings.voiceStyle;
      container.dataset.indicatorPlacement = settings.voicePlacement;
      container.dataset.indicatorSize = String(settings.voiceSize);
      if (settings.stageMode === "sandbox") {
        viewer.camera.position.set(26, 24, 36);
        viewer.zoom = settings.zoom * 0.9;
        viewer.camera.lookAt(0, -8, 0);
      } else {
        viewer.resetCameraPose();
        const extraTop = settings.voiceIndicator ? speechBounds.maxY - 16 : 0;
        const fit = settings.voiceIndicator
          ? Math.min(
              1,
              32 / (32 + extraTop),
              28 / (speechBounds.maxX - speechBounds.minX),
            )
          : 1;
        viewer.zoom =
          settings.zoom * (settings.framing === "portrait" ? 1.65 : 1) * fit;
        viewer.camera.position.y = extraTop / 2;
        viewer.camera.lookAt(0, extraTop / 2, 0);
      }
      container.dataset.background = settings.background;
      container.style.backgroundColor =
        settings.background === "color"
          ? settings.backgroundColor
          : "transparent";
      container.style.backgroundImage =
        settings.background === "image"
          ? `url("${settings.backgroundImage}")`
          : "";
      const key = `${settings.skinSource}|${settings.model}`;
      if (key !== source) {
        source = key;
        const version = ++loadVersion;
        container.dataset.skinLoaded = "false";
        try {
          const response = await fetch(settings.skinSource);
          if (!response.ok) {
            const result = await response.json();
            throw new Error(result.error || "Skin could not be loaded.");
          }
          const blob = await response.blob();
          const image = await createImageBitmap(blob);
          if (version !== loadVersion || disposed) {
            image.close();
            return;
          }
          await viewer.loadSkin(
            image,
            settings.model === "auto" ? {} : { model: settings.model },
          );
          image.close();
          container.dataset.skinLoaded = "true";
          onError(null);
        } catch (err) {
          if (version === loadVersion) {
            source = "";
            onError(err.message);
          }
        }
      }
    },
    setInput(next) {
      if (Object.hasOwn(next, "relativeAvailable"))
        relativeAt = performance.now();
      input = { ...input, ...next };
    },
    setMinecraft(next) {
      minecraft = next;
      minecraftAt = performance.now();
    },
    setPerformance(next) {
      play = next;
    },
    testVoice() {
      testUntil = performance.now() + 2200;
    },
    dispose() {
      disposed = true;
      loadVersion++;
      cancelAnimationFrame(frame);
      observer.disconnect();
      speech.dispose();
      island.dispose();
      material.dispose();
      viewer.dispose();
    },
  };
}
