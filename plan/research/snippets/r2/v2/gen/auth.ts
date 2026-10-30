import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { admin } from "better-auth/plugins";
import { createAccessControl } from "better-auth/plugins/access";
import { defaultStatements, adminAc, userAc } from "better-auth/plugins/admin/access";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

const client = postgres("postgres://planner:planner@127.0.0.1:55433/planner");
const db = drizzle(client);
const ac = createAccessControl(defaultStatements);
const manager = ac.newRole({ ...adminAc.statements });
const worker = ac.newRole({ ...userAc.statements });

export const auth = betterAuth({
  database: drizzleAdapter(db, { provider: "pg" }),
  emailAndPassword: { enabled: true, disableSignUp: true },
  user: {
    additionalFields: {
      nickname: { type: "string", required: false, input: false },
      positionId: { type: "string", required: false, input: false },
      mustChangePassword: { type: "boolean", required: true, defaultValue: true, input: false },
      color: { type: "string", required: false, input: false },
      deactivatedOn: { type: "date", required: false, input: false },
    },
  },
  plugins: [admin({ ac, roles: { manager, worker }, defaultRole: "worker", adminRoles: ["manager"] })],
});
