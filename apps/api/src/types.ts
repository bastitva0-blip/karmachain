import type { schema } from "./db/client";

export type User = typeof schema.users.$inferSelect;

export interface AppEnv {
  Variables: {
    requestId: string;
    user: User | null;
    sessionId: string | null;
  };
}
