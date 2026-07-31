import "dotenv/config";
import { z } from "zod";

const envSchema = z.object({
  DATABASE_URL: z.string().min(1),
  JWT_ACCESS_SECRET: z.string().min(20),
  JWT_REFRESH_SECRET: z.string().min(20),
  PORT: z.coerce.number().default(4000),
  CORS_ORIGIN: z.string().default("http://localhost:3000"),
  UPLOAD_DIR: z.string().default("./uploads"),
  AZURE_VISION_ENDPOINT: z.string().url().optional(),
  AZURE_VISION_KEY: z.string().optional(),
  CLOUDINARY_URL: z.string().url().optional(),
});

export const env = envSchema.parse(process.env);
