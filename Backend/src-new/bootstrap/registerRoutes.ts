import type { Application } from "express";
import v1Routes from "@presentation/routes/v1/index.js";

export function registerRoutes(app: Application) {
  app.use("/api/v1", v1Routes);
}