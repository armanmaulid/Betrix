import type { Application } from "express";
import { createV1Router } from "@presentation/routes/v1/index.js";

export function registerRoutes(app: Application) {
  // createV1Router() dipanggil saat runtime — setelah registerDependencies() —
  // sehingga container.resolve() di dalam factory route tidak kena container kosong.
  app.use("/api/v1", createV1Router());
}