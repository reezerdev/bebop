import { useRowReadPermissions } from "../hooks/use-row-permissions.js";
import { useMemo, useEffect, useState } from "react";
import { useAll, useDb } from "jazz-tools/react";

import type { BebopAdminCollection } from "../../../types.js";

import type { BebopAdminClient, BebopAdminProps, BebopRelationOption } from "../types.js";
import type { AdminRecord, AdminDatabase, RelationOption } from "../data-access.js";
import { getTable, getMutations } from "../data-access.js";

import { recordTitle } from "../record-values.js";

export function RelatedCollectionLabels({ app, client, collection, ids, relationOptions, relationOptionLoaders, onChange }: {
  app: object;
  client: BebopAdminClient;
  collection: BebopAdminCollection;
  ids: readonly string[];
  relationOptions?: BebopAdminProps["relationOptions"];
  relationOptionLoaders?: BebopAdminProps["relationOptionLoaders"];
  onChange: (slug: string, options: readonly RelationOption[]) => void;
}) {
  const db = useDb() as AdminDatabase;
  const table = getTable(app, collection.slug);
  const loader = relationOptionLoaders?.[collection.slug];
  const query = !loader && ids.length
    ? getMutations(client, collection.slug)?.query({ where: { id: { in: [...ids] } } })
    : undefined;
  const { data } = useAll<AdminRecord>(query);
  const readPermissions = useRowReadPermissions(db, table, data ?? []);
  const [loadedOptions, setLoadedOptions] = useState<readonly BebopRelationOption[]>([]);
  const requestedIdsKey = JSON.stringify([...new Set(ids)]);
  const requestedIds = useMemo(() => JSON.parse(requestedIdsKey) as string[], [requestedIdsKey]);

  useEffect(() => {
    if (!loader || requestedIds.length === 0) {
      setLoadedOptions([]);
      return;
    }
    let active = true;
    void loader({ search: "", ids: requestedIds, limit: requestedIds.length, offset: 0 })
      .then((result) => { if (active) setLoadedOptions(result.options); })
      .catch((error: unknown) => {
        if (!active) return;
        setLoadedOptions([]);
        console.error(`Could not resolve ${collection.labels.plural.toLocaleLowerCase()} labels:`, error);
      });
    return () => { active = false; };
  }, [collection.labels.plural, loader, requestedIdsKey]);

  const options = useMemo(() => loader
    ? [...(relationOptions?.[collection.slug] ?? []), ...loadedOptions].reduce<BebopRelationOption[]>((current, option) => {
      const index = current.findIndex((candidate) => candidate.id === option.id);
      if (index < 0) current.push(option);
      else current[index] = option;
      return current;
    }, [])
    : (data ?? [])
    .filter((row) => readPermissions[row.id] !== "denied")
    .map((row) => ({ id: row.id, name: recordTitle(collection, row, relationOptions) ?? row.id })),
  [collection, data, loadedOptions, loader, readPermissions, relationOptions]);

  useEffect(() => { onChange(collection.slug, options); }, [collection.slug, onChange, options]);
  return null;
}
