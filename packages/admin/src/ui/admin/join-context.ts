import type { BebopAdminJoinField, BebopAdminManifest, BebopAdminStoredField } from "../../types.js";

export type JoinNavigationContext = {
  sourceSlug: string;
  parentId: string;
  returnTo: string;
  relationship: BebopAdminStoredField;
};

export function resolveJoinContext(manifest: BebopAdminManifest, targetSlug: string, params: URLSearchParams): JoinNavigationContext | undefined {
  const parentId = params.get("bebopParent");
  const [sourceSlug, joinName, ...rest] = (params.get("bebopJoin") ?? "").split(".");
  if (!parentId || !sourceSlug || !joinName || rest.length) return undefined;
  const source = manifest.collections[sourceSlug];
  const target = manifest.collections[targetSlug];
  const join = source?.fields.find((field): field is BebopAdminJoinField => field.kind === "join" && field.name === joinName);
  if (!source || !target || !join || join.collection !== targetSlug) return undefined;
  const relationship = target.fields.find((field): field is BebopAdminStoredField =>
    field.kind === "relation" && field.name === join.on && field.relationTo === sourceSlug,
  );
  if (!relationship) return undefined;
  return {
    sourceSlug,
    parentId,
    relationship,
    returnTo: `/admin/collections/${sourceSlug}/${encodeURIComponent(parentId)}`,
  };
}
