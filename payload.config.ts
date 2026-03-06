import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildConfig } from "payload";
import { postgresAdapter } from "@payloadcms/db-postgres";
import { lexicalEditor } from "@payloadcms/richtext-lexical";

const filename = fileURLToPath(import.meta.url);
const dirname = path.dirname(filename);
const payloadSecret = process.env.PAYLOAD_SECRET?.trim() || process.env.ADMIN_SESSION_SECRET?.trim() || "";
const payloadDatabaseUrl = process.env.PAYLOAD_DATABASE_URL?.trim() || "";

if (!payloadSecret) {
  throw new Error("Missing PAYLOAD_SECRET (or ADMIN_SESSION_SECRET) in environment.");
}

if (!payloadDatabaseUrl) {
  throw new Error("Missing PAYLOAD_DATABASE_URL in environment.");
}

export default buildConfig({
  secret: payloadSecret,
  admin: {
    user: "admin-users",
    components: {
      beforeNavLinks: [
        {
          path: "./payload-components/admin-moderation-nav-link.tsx",
          exportName: "default",
        },
      ],
      views: {
        dashboard: {
          Component: {
            path: "./payload-components/moderation-dashboard.tsx",
            exportName: "default",
          },
        },
        moderation: {
          path: "/moderation",
          Component: {
            path: "./payload-components/moderation-dashboard.tsx",
            exportName: "default",
          },
        },
      },
    },
  },
  editor: lexicalEditor(),
  collections: [
    {
      slug: "admin-users",
      auth: true,
      admin: {
        useAsTitle: "email",
      },
      fields: [
        {
          name: "firebaseUid",
          type: "text",
          required: true,
          unique: true,
        },
        {
          name: "role",
          type: "select",
          required: true,
          defaultValue: "moderator",
          options: [
            { label: "Owner", value: "owner" },
            { label: "Moderator", value: "moderator" },
          ],
        },
        {
          name: "active",
          type: "checkbox",
          defaultValue: true,
        },
      ],
    },
    {
      slug: "moderation-actions",
      admin: {
        useAsTitle: "targetId",
        defaultColumns: ["targetType", "targetId", "action", "performedByEmail", "createdAt"],
      },
      fields: [
        {
          name: "targetType",
          type: "select",
          required: true,
          options: ["user", "post", "comment", "like"],
        },
        {
          name: "targetId",
          type: "text",
          required: true,
        },
        {
          name: "action",
          type: "select",
          required: true,
          options: ["suspend", "unsuspend", "hide", "unhide", "delete"],
        },
        {
          name: "reason",
          type: "textarea",
          required: true,
        },
        {
          name: "performedByUid",
          type: "text",
          required: true,
        },
        {
          name: "performedByEmail",
          type: "email",
          required: true,
        },
        {
          name: "metadata",
          type: "json",
        },
      ],
      timestamps: true,
    },
  ],
  db: postgresAdapter({
    pool: {
      connectionString: payloadDatabaseUrl,
    },
  }),
  typescript: {
    outputFile: path.resolve(dirname, "payload-types.ts"),
  },
});
