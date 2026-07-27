export function isDeviceEnforcementEnabled() {
  return process.env.DEVICE_ENFORCEMENT !== "false";
}
