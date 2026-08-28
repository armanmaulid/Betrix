import { inject, injectable } from "tsyringe";
import { MessageRepository } from "@domain/repositories/MessageRepository.js";

interface GetNotificationPrefsInput {
  userId: string;
}

@injectable()
export class GetNotificationPrefsUseCase {
  constructor(@inject("MessageRepository") private messageRepo: MessageRepository) {}

  async execute(input: GetNotificationPrefsInput): Promise<{ emailEnabled: boolean }> {
    const emailEnabled = await this.messageRepo.getNotificationPreference(input.userId);
    return { emailEnabled };
  }
}
