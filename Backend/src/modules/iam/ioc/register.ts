// modules/iam/ioc/register.ts
// tsyringe container registration untuk module IAM.
// TODO (BETRIX-001): pindahkan semua @inject("XxxRepository") dari src/bootstrap/container.ts ke sini.

import { type DependencyContainer } from "tsyringe";

export function registerIamContainer(container: DependencyContainer): void {
  void container;
}
