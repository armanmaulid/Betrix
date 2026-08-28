// modules/news/ioc/register.ts
// tsyringe container registration untuk module News.
// TODO (BETRIX-001): pindahkan semua @inject("XxxRepository") dari src/bootstrap/container.ts ke sini.

import { type DependencyContainer } from "tsyringe";

export function registerNewsContainer(container: DependencyContainer): void {
  void container;
}
