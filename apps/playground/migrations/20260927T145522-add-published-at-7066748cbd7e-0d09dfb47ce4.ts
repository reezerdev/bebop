import { schema as s } from "jazz-tools";

export default s.defineMigration({
  migrate: {
    "posts": {
      "publishedAt": s.add.timestamp({ default: null }),
    },
  },
  fromHash: "7066748cbd7e",
  toHash: "0d09dfb47ce4",
  from: {
  "posts": s.table({
    "title": s.string(),
    "body": s.string().optional(),
    "slug": s.string().optional(),
    "published": s.boolean().optional(),
    "category": s.enum("announcement", "guide", "story").optional(),
  }, {

  })
},
  to: {
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
});
