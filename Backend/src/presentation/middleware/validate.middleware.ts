import type { Request, Response, NextFunction } from "express";
import type { ZodSchema} from "zod";
import { ZodError } from "zod";
import { ValidationError } from "@core/errors/index.js";

function hasNestedShape(schema: ZodSchema): boolean {
  if (!("shape" in schema)) return false;
  const shape = schema.shape;
  if (typeof shape !== "object" || shape === null) return false;
  // Hanya dianggap "nested" (body/query/params wrapper) jika nilai di shape
  // itu sendiri ZodObject (punya properti `.shape`) — bukan sekadar ada key
  // bernama "body"/"query"/"params". Kalau `shape.body` adalah ZodString
  // (mis. adminBroadcastDto), itu field FLAT, bukan wrapper request.
  for (const key of ["body", "query", "params"] as const) {
    const candidate = (shape as Record<string, unknown>)[key];
    if (candidate && typeof candidate === "object" && "shape" in candidate) {
      return true;
    }
  }
  return false;
}

export function validate(schema: ZodSchema) {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      let target = req.body;
      
      if (schema && hasNestedShape(schema)) {
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