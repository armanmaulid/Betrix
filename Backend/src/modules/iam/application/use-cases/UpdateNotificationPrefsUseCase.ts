import { inject, injectable } from "tsyringe";
import { MessageRepository } from "@domain/repositories/MessageRepository.js";
import { ValidationError } from "@core/errors/index.js";

interface UpdateNotificationPrefsInput {
  userId: string;
  emailEnabled: boolean;
}

@injectable()
export class UpdateNotificationPrefsUseCase {
  constructor(@inject("MessageRepository") private messageRepo: MessageRepository) {}

  async execute(input: UpdateNotificationPrefsInput): Promise<void> {
    if (typeof input.emailEnabled !== "boolean") {
      throw new ValidationError("emailEnabled must be a boolean");
    }
    await this.messageRepo.setNotificationPreference(input.userId, input.emailEnabled);
  }
}