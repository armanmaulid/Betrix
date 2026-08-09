import { env } from "@config/env";

export function isDeviceEnforcementEnabled(): boolean {
  return env.DEVICE_ENFORCEMENT === true;
}