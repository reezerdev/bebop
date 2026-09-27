import { schema as s } from "jazz-tools";

export default s.defineMigration({
  createTables: {
    "better_auth_account": true,
    "better_auth_jwks": true,
    "better_auth_session": true,
    "better_auth_user": true,
    "better_auth_verification": true,
  },
  fromHash: "0d09dfb47ce4",
  toHash: "902c2bb405a1",
  from: {},
  to: {
  "better_auth_account": s.table({
    "issuer": s.string(),
    "accountId": s.string(),
    "providerId": s.string(),
    "userId": s.uuid(),
    "accessToken": s.string().optional(),
    "refreshToken": s.string().optional(),
    "idToken": s.string().optional(),
    "accessTokenExpiresAt": s.timestamp().optional(),
    "refreshTokenExpiresAt": s.timestamp().optional(),
    "scope": s.string().optional(),
    "password": s.string().optional(),
    "createdAt": s.timestamp(),
    "updatedAt": s.timestamp(),
  }, {
    "userIdRelation": s.rel("better_auth_user", "userId"),
  }),
  "better_auth_jwks": s.table({
    "publicKey": s.string(),
    "privateKey": s.string(),
    "createdAt": s.timestamp(),
    "expiresAt": s.timestamp().optional(),
    "alg": s.string().optional(),
    "crv": s.string().optional(),
  }, {

  }),
  "better_auth_session": s.table({
    "expiresAt": s.timestamp(),
    "token": s.string(),
    "createdAt": s.timestamp(),
    "updatedAt": s.timestamp(),
    "ipAddress": s.string().optional(),
    "userAgent": s.string().optional(),
    "userId": s.uuid(),
  }, {
    "userIdRelation": s.rel("better_auth_user", "userId"),
  }),
  "better_auth_user": s.table({
    "name": s.string(),
    "email": s.string(),
    "emailVerified": s.boolean(),
    "image": s.string().optional(),
    "createdAt": s.timestamp(),
    "updatedAt": s.timestamp(),
  }, {

  }),
  "better_auth_verification": s.table({
    "identifier": s.string(),
    "value": s.string(),
    "expiresAt": s.timestamp(),
    "createdAt": s.timestamp(),
    "updatedAt": s.timestamp(),
  }, {

  })
},
});
