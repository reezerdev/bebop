import { schema as s } from "jazz-tools";

export default s.defineMigration({
  migrate: {
    "posts": {
      "author": s.add.string({ default: "Unknown author" }),
    },
  },
  fromHash: "902c2bb405a1",
  toHash: "d587f0e8b6af",
  from: {
  "posts": s.table({
    "title": s.string(),
    "body": s.string().optional(),
    "slug": s.string().optional(),
    "publishedAt": s.timestamp().optional(),
    "published": s.boolean().optional(),
    "category": s.enum("announcement", "guide", "story").optional(),
  }, {

  })
},
  to: {
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
});
