import { useRowReadPermissions } from "../hooks/use-row-permissions.js";
import { useMemo, useEffect } from "react";
import { useAll, useDb } from "jazz-tools/react";

import type { BebopAdminCollection } from "../../../types.js";

import type { BebopAdminClient, BebopAdminProps } from "../types.js";
import type { AdminRecord, AdminDatabase, RelationOption } from "../data-access.js";
import { getTable, getMutations } from "../data-access.js";

import { recordTitle } from "../record-values.js";

export function RelatedCollectionLabels({ app, client, collection, ids, relationOptions, onChange }: {
  app: object;
  client: BebopAdminClient;
  collection: BebopAdminCollection;
  ids: readonly string[];
  relationOptions?: BebopAdminProps["relationOptions"];
  onChange: (slug: string, options: readonly RelationOption[]) => void;
}) {
  const db = useDb() as AdminDatabase;
  const table = getTable(app, collection.slug);
  const query = ids.length
    ? getMutations(client, collection.slug)?.query({ where: { id: { in: [...ids] } } })
    : undefined;
  const { data } = useAll<AdminRecord>(query);
  const readPermissions = useRowReadPermissions(db, table, data ?? []);
  const options = useMemo(() => (data ?? [])
    .filter((row) => readPermissions[row.id] !== "denied")
    .map((row) => ({ id: row.id, name: recordTitle(collection, row, relationOptions) ?? row.id })),
  [collection, data, readPermissions, relationOptions]);

  useEffect(() => { onChange(collection.slug, options); }, [collection.slug, onChange, options]);
  return null;
}
