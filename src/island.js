import {
  Group,
  BoxGeometry,
  MeshLambertMaterial,
  Mesh,
  PlaneGeometry,
} from "three";

export function createIsland(scene) {
  const island = new Group();
  const blocks = new Group();
  const geometry = new BoxGeometry(3.94, 4, 3.94);
  const colors = {
    grass: [0x75934e, 0x526b3a],
    stone: [0x9ba5aa, 0x707c87],
    wood: [0xc2965c, 0x86613a],
  };
  const materials = Object.fromEntries(
    Object.entries(colors).map(([type, [top, side]]) => [
      type,
      [side, side, top, side, side, side].map(
        (color) => new MeshLambertMaterial({ color }),
      ),
    ]),
  );
  const floorGeo = new BoxGeometry(3.97, 1.8, 3.97);
  const floorMaterials = [
    0x617b46, 0x617b46, 0x92b76b, 0x64492e, 0x617b46, 0x617b46,
  ].map((color) => new MeshLambertMaterial({ color }));
  for (let x = -3; x <= 3; x++)
    for (let z = -3; z <= 3; z++) {
      const tile = new Mesh(floorGeo, floorMaterials);
      tile.position.set(x * 4, -8.9, z * 4);
      island.add(tile);
    }
  const targetMaterial = new MeshLambertMaterial({
    color: 0xe4d498,
    transparent: true,
    opacity: 0.65,
    depthWrite: false,
  });
  const targetGeo = new PlaneGeometry(3.7, 3.7);
  const target = new Mesh(targetGeo, targetMaterial);
  target.rotation.x = -Math.PI / 2;
  island.add(target, blocks);
  scene.add(island);
  island.visible = false;
  let revision = -1;
  return {
    update(state, visible) {
      island.visible = visible;
      if (!visible) return;
      if (state.revision !== revision) {
        revision = state.revision;
        blocks.clear();
        for (const block of state.blocks) {
          const mesh = new Mesh(geometry, materials[block.type]);
          mesh.position.set(block.x * 4, -6, block.z * 4);
          blocks.add(mesh);
        }
      }
      const x = Math.round(state.x + Math.sin(state.heading)),
        z = Math.round(state.z + Math.cos(state.heading));
      target.visible = Math.abs(x) <= 3 && Math.abs(z) <= 3;
      const occupied = state.blocks.some(
        (block) => block.x === x && block.z === z,
      );
      target.position.set(x * 4, occupied ? -3.97 : -7.97, z * 4);
    },
    dispose() {
      scene.remove(island);
      geometry.dispose();
      floorGeo.dispose();
      targetGeo.dispose();
      targetMaterial.dispose();
      floorMaterials.forEach((mat) => mat.dispose());
      Object.values(materials)
        .flat()
        .forEach((mat) => mat.dispose());
    },
  };
}
