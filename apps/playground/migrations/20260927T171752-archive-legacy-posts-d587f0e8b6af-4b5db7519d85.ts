import { schema as s } from "jazz-tools";

export default s.defineMigration({
  renameTables: {
    legacyPosts: s.renameTableFrom("posts"),
  },
  fromHash: "d587f0e8b6af",
  toHash: "4b5db7519d85",
  from: {
  "posts": s.table({
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
  to: {
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
});
