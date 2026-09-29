import { collection, defineConfig } from "../src/bebop.ts";
import { createBebopBetterAuthClient } from "../src/auth-client.ts";
import type { BebopClient } from "../src/client.ts";

const config = defineConfig({
  collections: [{
    slug: "posts",
    fields: [
      { name: "title", type: "text", required: true },
      { name: "status", type: "select", options: ["draft", "published"] },
      { name: "stage", type: "select", options: [{ label: "Ready", value: "ready" }, "blocked"] },
      { name: "author", type: "relationship", relationTo: "users" },
    ],
  }],
});

declare const client: BebopClient<typeof config>;

const ownedConfig = defineConfig({
  collections: [collection({
    slug: "ownedPosts",
    fields: [{ name: "ownerId", type: "text", required: true }],
    access: {
      read: ({ row }) => {
        return { ownerId: row.ownerId };
      },
    },
    hooks: {
      beforeChange: ({ data }) => {
        const ownerId: string | undefined = data.ownerId;
        // @ts-expect-error Hook data only contains configured fields.
        void data.missing;
        return { ownerId };
      },
    },
  })],
});

const workspaceMembershipConfig = defineConfig({
  collections: [
    collection({
      slug: "workspaces",
      fields: [{ name: "name", type: "text", required: true }],
      access: {
        read: ({ row, session, exists }) => {
          return exists("workspaceMemberships", {
            workspaceId: row.id,
            userAccount: session.user.account,
            status: "active",
          });
        },
      },
    }),
    collection({
      slug: "workspaceMemberships",
      fields: [
        { name: "workspace", type: "relationship", relationTo: "workspaces", required: true },
        { name: "userAccount", type: "text", required: true },
        { name: "status", type: "select", options: ["active", "pending"] },
      ],
    }),
  ],
});
void workspaceMembershipConfig;

declare const ownedClient: BebopClient<typeof ownedConfig>;
if (false) {
  void ownedClient.ownedPosts.create({ ownerId: "user-1" });
  // @ts-expect-error Required ownerId is missing.
  void ownedClient.ownedPosts.create({});
}

if (false) {
  void client.posts.create({ title: "Hello", status: "draft" });
  void client.posts.query({ where: { status: { eq: "published" } }, limit: 10 });
  void client.posts.query({ where: { authorId: "user-1" } });
  void client.posts.create({ title: "Hello", stage: "ready" });

  // @ts-expect-error Required title is missing.
  void client.posts.create({ status: "draft" });
  // @ts-expect-error Select values retain their configured literals.
  void client.posts.create({ title: "Hello", status: "archived" });
  // @ts-expect-error Object select options retain their configured values.
  void client.posts.create({ title: "Hello", stage: "unknown" });
  // @ts-expect-error Query predicates use the field's value type.
  void client.posts.query({ where: { title: 42 } });
  // @ts-expect-error Unknown fields cannot be queried.
  void client.posts.query({ where: { missing: "x" } });
  // @ts-expect-error Relationship storage is exposed as authorId, not author.
  void client.posts.query({ where: { author: "user-1" } });
  // @ts-expect-error Unknown collections are absent from the client.
  void client.comments.find();
}

const uploadConfig = defineConfig({ collections: [
  collection({ slug: "media", upload: { mimeTypes: ["image/*"] }, fields: [{ name: "alt", type: "text" }] }),
  collection({ slug: "tasks", fields: [{ name: "image", type: "upload", relationTo: "media" }] }),
] });
declare const uploadClient: BebopClient<typeof uploadConfig>;
if (false) {
  void uploadClient.media.create({ file: new Blob() });
  void uploadClient.media.update("id", { file: new Blob() });
  void uploadClient.media.readFile("id");
  void uploadClient.tasks.create({ imageId: "id" });
  // @ts-expect-error An upload-enabled collection requires file content.
  void uploadClient.media.create({});
  // @ts-expect-error Upload references are stored as imageId.
  void uploadClient.tasks.create({ image: "id" });
  // @ts-expect-error Ordinary collections have no file reader.
  void uploadClient.tasks.readFile("id");
}

const authConfig = defineConfig({ collections: [
  collection({ slug: "users", auth: true, fields: [] }),
  collection({ slug: "tasks", fields: [{ name: "author", type: "relationship", relationTo: "users" }] }),
] });
declare const authClient: BebopClient<typeof authConfig>;
const betterAuthClient = createBebopBetterAuthClient();
if (false) {
  void authClient.tasks.create({ authorId: "user-1" });
  // @ts-expect-error Better Auth's user model is not exposed as a Jazz CRUD collection.
  void authClient.users.find();
  void betterAuthClient.admin.listUsers({ query: { limit: 10, offset: 0 } });
}
