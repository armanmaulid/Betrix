import { container } from "tsyringe";
import { logger } from "@core/logging/logger.js";
import { SystemCleanupUseCase } from "@application/use-cases/admin/SystemCleanupUseCase.js";

export class HourlyCleanupJob {
  static async execute(): Promise<void> {
    const cleanupUseCase = container.resolve(SystemCleanupUseCase);
    await cleanupUseCase.execute().catch(err => 
      logger.error("Hourly cleanup failed", { context: "Cleanup", error: (err as Error).message })
    );
  }

  static start(): void {
    setInterval(() => HourlyCleanupJob.execute(), 60 * 60 * 1000).unref();
  }
}
