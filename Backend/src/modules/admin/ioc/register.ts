// modules/admin/ioc/register.ts
// tsyringe container registration untuk module Admin.
// TODO (BETRIX-001): pindahkan semua @inject("XxxRepository") dari src/bootstrap/container.ts ke sini.

import { type DependencyContainer } from "tsyringe";

export function registerAdminContainer(container: DependencyContainer): void {
  // Placeholder — repositories & services akan di-register di Fase 2.
  // Untuk sekarang, semua registration ada di src/bootstrap/container.ts.
  void container;
}
