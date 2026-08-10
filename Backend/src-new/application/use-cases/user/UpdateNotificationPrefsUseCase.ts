import { inject, injectable } from "tsyringe";
import { pgClient } from "@data/orm/pgClient.js";

interface UpdateNotificationPrefsInput {
  userId: string;
  emailEnabled: boolean;
}

@injectable()
export class UpdateNotificationPrefsUseCase {
  async execute(input: UpdateNotificationPrefsInput): Promise<void> {
    await pgClient.query(
      `INSERT INTO message_notification_preferences (user_id, email_enabled, updated_at)
       VALUES ($1, $2, CURRENT_TIMESTAMP)
       ON CONFLICT (user_id)
       DO UPDATE SET email_enabled = $2, updated_at = CURRENT_TIMESTAMP`,
      [input.userId, input.emailEnabled]
    );
  }
}