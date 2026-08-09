import type { Role } from "@prisma/client";
import { prisma } from "../db";

interface NotifyInput {
  userId?: string;
  role?: Role;
  type: string;
  title: string;
  body?: string;
  entityType?: string;
  entityId?: string;
}

/** Creates a real notification row — targeted at one user, or broadcast to a role. */
export async function notify(input: NotifyInput) {
  return prisma.notification.create({ data: input });
}
