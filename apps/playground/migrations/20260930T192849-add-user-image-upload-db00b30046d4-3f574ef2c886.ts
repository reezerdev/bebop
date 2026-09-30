import { schema as s } from "jazz-tools";

export default s.defineMigration({
  migrate: {
    "better_auth_user": {
      "imageId": s.add.string({ default: null }),
    },
  },
  fromHash: "db00b30046d4",
  toHash: "3f574ef2c886",
  from: {
  "better_auth_user": s.table({
    "name": s.string(),
    "email": s.string(),
    "emailVerified": s.boolean(),
    "image": s.string().optional(),
    "createdAt": s.timestamp(),
    "updatedAt": s.timestamp(),
    "role": s.string().optional(),
    "banned": s.boolean().optional(),
    "banReason": s.string().optional(),
    "banExpires": s.timestamp().optional(),
    "username": s.string().optional(),
    "gender": s.string().optional(),
    "mode": s.enum("light", "dark").optional(),
    "language": s.enum("en", "es").optional(),
    "firstName": s.string().optional(),
    "lastName": s.string().optional(),
    "position": s.string().optional(),
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
    "role": s.string().optional(),
    "banned": s.boolean().optional(),
    "banReason": s.string().optional(),
    "banExpires": s.timestamp().optional(),
    "username": s.string().optional(),
    "gender": s.string().optional(),
    "mode": s.enum("light", "dark").optional(),
    "language": s.enum("en", "es").optional(),
    "firstName": s.string().optional(),
    "lastName": s.string().optional(),
    "position": s.string().optional(),
    "imageId": s.string().optional(),
  }, {

  })
},
});
