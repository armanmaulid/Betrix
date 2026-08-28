// modules/chat/ioc/register.ts
// tsyringe container registration untuk module Chat.
// TODO (BETRIX-001): pindahkan semua @inject("XxxRepository") dari src/bootstrap/container.ts ke sini.

import { type DependencyContainer } from "tsyringe";

export function registerChatContainer(container: DependencyContainer): void {
  void container;
}
