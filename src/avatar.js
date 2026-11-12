import { SkinViewer } from "skinview3d";
import { BoxGeometry, Mesh, MeshBasicMaterial, Group } from "three";

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
  const speech = new Group();
  const material = new MeshBasicMaterial({
    color: "#a6efb4",
    transparent: true,
    opacity: 1,
  });
  const bars = [-1, 0, 1].map((n) => {
    const mesh = new Mesh(new BoxGeometry(0.55, 1, 0.28), material);
    mesh.position.set(6.1 + n * 0.95, 5.9, 0);
    speech.add(mesh);
    return mesh;
  });
  skin.head.add(speech);
  speech.visible = false;
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
      const targetX = settings.tracking ? input.x * settings.sensitivity : 0;
      const targetY = settings.tracking ? input.y * settings.sensitivity : 0;
      x += (targetX - x) * blend;
      y += (targetY - y) * blend;
      const talking = input.connected && input.level > settings.threshold;
      voice +=
        ((talking ? Math.min(1, input.level * 3 + 0.3) : 0) - voice) *
        (1 - Math.exp(-delta * (talking ? 22 : 12)));
      const t = now / 1000;
      skin.head.rotation.set(y * 0.55, x * 0.85, -x * 0.05);
      viewer.playerObject.rotation.y = -0.12 + x * 0.23;
      skin.body.rotation.z = -x * 0.045;
      skin.leftArm.rotation.z =
        -0.055 - (settings.idle ? Math.sin(t * 1.6) * 0.025 : 0) - voice * 0.05;
      skin.rightArm.rotation.z =
        0.055 + (settings.idle ? Math.sin(t * 1.6) * 0.025 : 0) + voice * 0.05;
      const baseY = settings.framing === "portrait" ? -8.5 : 0;
      viewer.playerObject.position.y =
        baseY +
        (settings.idle ? Math.sin(t * 1.8) * 0.17 : 0) +
        voice * Math.abs(Math.sin(t * 12)) * 0.65;
      speech.visible = settings.voiceIndicator && voice > 0.025;
      material.opacity = Math.min(1, voice * 4);
      bars.forEach((bar, index) => {
        bar.scale.y =
          0.6 + voice * (1.6 + Math.sin(t * 16 + index * 1.7) * 0.8);
      });
      container.dataset.speaking = String(talking);
      container.dataset.gazeX = x.toFixed(3);
      container.dataset.gazeY = y.toFixed(3);
    }
    viewer.render();
    frame = requestAnimationFrame(render);
  };
  frame = requestAnimationFrame(render);
  return {
    async configure(next) {
      settings = next;
      material.color.set(settings.voiceColor);
      viewer.zoom =
        settings.zoom * (settings.framing === "portrait" ? 1.65 : 1);
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
      input = { ...input, ...next };
    },
    dispose() {
      disposed = true;
      loadVersion++;
      cancelAnimationFrame(frame);
      observer.disconnect();
      speech.children.forEach((mesh) => mesh.geometry.dispose());
      material.dispose();
      viewer.dispose();
    },
  };
}
