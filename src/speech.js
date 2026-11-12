import { BoxGeometry, SphereGeometry, TorusGeometry, Group, Mesh } from "three";

export function createSpeech(head, material) {
  const group = new Group();
  head.add(group);
  let shape = "";
  let style;
  const clear = () => {
    for (const mesh of [...group.children]) {
      mesh.geometry.dispose();
      group.remove(mesh);
    }
  };
  return {
    configure(settings) {
      style = settings.voiceStyle;
      const key = `${style}:${settings.voiceCount}`;
      if (shape !== key) {
        shape = key;
        clear();
        const count = style === "ring" ? 1 : settings.voiceCount;
        for (let i = 0; i < count; i++) {
          const geometry =
            style === "ring"
              ? new TorusGeometry(1.3, 0.2, 6, 32)
              : style === "dots"
                ? new SphereGeometry(0.36, 8, 6)
                : new BoxGeometry(0.55, 1, 0.28);
          const mesh = new Mesh(geometry, material);
          mesh.position.x = (i - (count - 1) / 2) * 0.95;
          group.add(mesh);
        }
      }
      const [px, py, pz] = {
        right: [7.4, 5.9, 0],
        left: [-7.4, 5.9, 0],
        above: [0, 10.5, 0],
        chest: [0, -5, 3.1],
      }[settings.voicePlacement];
      group.position.set(
        px + settings.voiceOffsetX,
        py + settings.voiceOffsetY,
        pz,
      );
      group.scale.setScalar(settings.voiceSize);
      material.color.set(settings.voiceColor);
      const halfWidth =
        (style === "ring"
          ? 2.1
          : ((settings.voiceCount - 1) * 0.95) / 2 + 0.6) * settings.voiceSize;
      const halfHeight =
        (style === "ring" ? 2.1 : style === "dots" ? 0.6 : 1.5) *
        settings.voiceSize;
      return {
        minX: Math.min(-6, group.position.x - halfWidth),
        maxX: Math.max(6, group.position.x + halfWidth),
        maxY: Math.max(16, 8 + group.position.y + halfHeight),
      };
    },
    animate(voice, time, settings) {
      group.visible = settings.voiceIndicator && voice > 0.025;
      material.opacity = Math.min(1, voice * 4) * settings.voiceOpacity;
      group.children.forEach((mesh, index) => {
        const pulse = Math.sin(time * 16 + index * 1.7);
        if (style === "bars")
          mesh.scale.set(1, 0.6 + voice * (1.6 + pulse * 0.8), 1);
        else
          mesh.scale.setScalar(
            1 + voice * (style === "ring" ? 0.35 : 0.6) * (0.6 + pulse * 0.4),
          );
      });
    },
    dispose() {
      clear();
      head.remove(group);
    },
  };
}
