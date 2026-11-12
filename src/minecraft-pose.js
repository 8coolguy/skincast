export const wrapDegrees = (degrees) =>
  ((((degrees + 180) % 360) + 360) % 360) - 180;

// Keep the OBS body facing the audience. Minecraft controls the relative head pose.
export function minecraftPose(state) {
  if (!state.active)
    return {
      x: 0,
      y: 0,
      stride: 0,
      lift: 0,
      crouch: 0,
      swing: 0,
      usingItem: false,
    };
  return {
    x: Math.max(-1, Math.min(1, -wrapDegrees(state.yaw - state.bodyYaw) / 75)),
    y: -state.pitch / 90,
    stride: Math.min(1, state.speed / 0.22) * (state.sprinting ? 1 : 0.7),
    lift: state.grounded ? 0 : Math.min(2, state.rise) * 1.8,
    crouch: state.crouching ? 1 : 0,
    swing: state.swing,
    usingItem: state.usingItem,
  };
}
