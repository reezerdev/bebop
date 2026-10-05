import { schema as s } from "jazz-tools";

export default s.defineMigration({
  migrate: {
    "posts": {
      "slug": s.add.string({ default: null }),
    },
  },
  fromHash: "eb6fca732486",
  toHash: "7066748cbd7e",
  from: {
  "posts": s.table({
    "title": s.string(),
    "body": s.string().optional(),
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
    "published": s.boolean().optional(),
    "category": s.enum("announcement", "guide", "story").optional(),
  }, {

  })
},
});
