import type { Request, Response, NextFunction } from "express";
import type { ZodSchema} from "zod";
import { ZodError } from "zod";
import { ValidationError } from "@core/errors/index.js";

export function validate(schema: ZodSchema) {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      schema.parse(req);
      next();
    } catch (err) {
      if (err instanceof ZodError) {
        const details = err.errors.map(e => ({
          path: e.path.join("."),
          message: e.message,
        }));
        next(new ValidationError("Validation failed", { errors: details }));
      } else {
        next(err);
      }
    }
  };
}