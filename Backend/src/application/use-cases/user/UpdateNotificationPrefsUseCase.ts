import { inject, injectable } from "tsyringe";
import { MessageRepository } from "@domain/repositories/MessageRepository.js";

interface UpdateNotificationPrefsInput {
  userId: string;
  emailEnabled: boolean;
}

@injectable()
export class UpdateNotificationPrefsUseCase {
  constructor(@inject("MessageRepository") private messageRepo: MessageRepository) {}

  async execute(input: UpdateNotificationPrefsInput): Promise<void> {
    await this.messageRepo.setNotificationPreference(input.userId, input.emailEnabled);
  }
}