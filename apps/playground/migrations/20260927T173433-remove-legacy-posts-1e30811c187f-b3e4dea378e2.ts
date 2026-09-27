import { schema as s } from "jazz-tools";

export default s.defineMigration({
  dropTables: {
    "legacyPosts": true,
  },
  fromHash: "1e30811c187f",
  toHash: "b3e4dea378e2",
  from: {
  "legacyPosts": s.table({
    "title": s.string(),
    "author": s.string(),
    "body": s.string().optional(),
    "slug": s.string().optional(),
    "publishedAt": s.timestamp().optional(),
    "published": s.boolean().optional(),
    "category": s.enum("announcement", "guide", "story").optional(),
  }, {

  })
},
  to: {},
});
