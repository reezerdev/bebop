import { schema as s } from "jazz-tools";

export default s.defineMigration({
  migrate: {
    "better_auth_user": {
      "username": s.add.string({ default: null }),
      "gender": s.add.string({ default: null }),
      "mode": s.add.enum("light", "dark", { default: null }),
      "language": s.add.enum("en", "es", { default: null }),
      "firstName": s.add.string({ default: null }),
      "lastName": s.add.string({ default: null }),
      "position": s.add.string({ default: null }),
    },
  },
  fromHash: "2ad64c350e44",
  toHash: "db00b30046d4",
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
  }, {

  })
},
});
