import type { Request, Response, NextFunction } from "express";
import type { ZodSchema} from "zod";
import { ZodError } from "zod";
import { ValidationError } from "@core/errors/index.js";

export function validate(schema: ZodSchema) {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      let target = req.body;
      
      if (schema && (schema as any).shape && ((schema as any).shape.body || (schema as any).shape.query || (schema as any).shape.params)) {
        target = req;
      } else if (req.method === 'GET' || req.method === 'DELETE') {
        // Fallback for flat GET schemas
        target = Object.keys(req.query).length > 0 ? req.query : req.params;
      }
      
      schema.parse(target);
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