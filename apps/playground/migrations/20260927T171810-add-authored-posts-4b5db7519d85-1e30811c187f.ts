import { schema as s } from "jazz-tools";

export default s.defineMigration({
  createTables: {
    "posts": true,
  },
  fromHash: "4b5db7519d85",
  toHash: "1e30811c187f",
  from: {
  "better_auth_user": s.table({
    "name": s.string(),
    "email": s.string(),
    "emailVerified": s.boolean(),
    "image": s.string().optional(),
    "createdAt": s.timestamp(),
    "updatedAt": s.timestamp(),
  }, {

  })
},
  to: {
  "better_auth_user": s.table({
    "name": s.string(),
    "email": s.string(),
    "emailVerified": s.boolean(),
    "image": s.string().optional(),
    "createdAt": s.timestamp(),
    "updatedAt": s.timestamp(),
  }, {

  }),
  "posts": s.table({
    "title": s.string(),
    "authorId": s.uuid(),
    "body": s.string().optional(),
    "slug": s.string().optional(),
    "publishedAt": s.timestamp().optional(),
    "published": s.boolean().optional(),
    "category": s.enum("announcement", "guide", "story").optional(),
  }, {
    "author": s.rel("better_auth_user", "authorId"),
  })
},
});
