// modules/market/ioc/register.ts
// tsyringe container registration untuk module Market.
// TODO (BETRIX-001): pindahkan semua @inject("XxxRepository") dari src/bootstrap/container.ts ke sini.

import { type DependencyContainer } from "tsyringe";

export function registerMarketContainer(container: DependencyContainer): void {
  void container;
}
