import { useEffect } from "react";
import { useAll } from "jazz-tools/react";
import type { QueryBuilder } from "jazz-tools";

import type { BebopAdminCollection } from "../../../types.js";

import type { BebopAdminClient } from "../types.js";
import type { AdminRecord } from "../data-access.js";
import { getMutations } from "../data-access.js";
import { defaultPageSize } from "../constants.js";

export function useAdminRows(client: BebopAdminClient, collectionSlug: string, options: {
  where: Record<string, unknown>;
  sort: { field: string; direction: "asc" | "desc" };
  page?: number;
  pageSize?: number;
  searchActive: boolean;
  search?: string;
  searchFields?: readonly string[];
  enabled?: boolean;
  writeMode?: BebopAdminCollection["writeMode"];
}) {
  const operations = getMutations(client, collectionSlug);
  // Command writes are confirmed by Core before the handler responds. Read the
  // same remote scope so a newly confirmed row cannot be hidden by an older
  // empty browser replica while its subscription catches up.
  const readOptions = options.writeMode === "command" ? { tier: "remote" as const } : undefined;
  const offset = ((options.page ?? 1) - 1) * (options.pageSize ?? defaultPageSize);
  const searchPageQuery = options.enabled === false || !options.searchActive ? undefined : operations?.search({
    search: options.search ?? "",
    fields: options.searchFields ?? [],
    where: options.where,
    orderBy: options.sort,
    limit: options.pageSize,
    offset,
  });
  const searchPage = useAll<AdminRecord>(searchPageQuery, readOptions);
  const pageIds = searchPage.data?.map((row) => row.id) ?? [];
  const query = options.enabled === false ? undefined : options.searchActive
    ? pageIds.length ? operations?.query({ where: { ...options.where, id: { in: pageIds } }, includeTimestamps: true }) : undefined
    : operations?.query({
      where: options.where,
      orderBy: options.sort,
      includeTimestamps: true,
      ...(options.pageSize !== undefined ? { limit: options.pageSize, offset } : {}),
    });
  const idsQuery = options.enabled === false || options.searchActive ? undefined : operations?.queryIds({ where: options.where });
  const docs = useAll<AdminRecord>(query, readOptions);
  const ids = useAll<{ id: string }>(idsQuery, readOptions);
  const docsById = new Map((docs.data ?? []).map((row) => [row.id, row]));
  const orderedRows = options.searchActive ? pageIds.flatMap((id) => {
    const row = docsById.get(id);
    return row ? [row] : [];
  }) : docs.data;
  const rows = options.searchActive
    ? { ...docs, data: orderedRows, isLoading: searchPage.isLoading || docs.isLoading, error: searchPage.error ?? docs.error }
    : docs;
  const searchIdQueries = options.enabled === false || !options.searchActive
    ? []
    : operations?.searchIds({ search: options.search ?? "", fields: options.searchFields ?? [], where: options.where }) ?? [];
  return { rows, ids, searchPage, searchIdQueries };
}

export function SearchIdsObserver({ query, onIds, writeMode }: { query?: QueryBuilder<{ id: string }>; onIds: (ids: readonly string[]) => void; writeMode?: BebopAdminCollection["writeMode"] }) {
  const { data } = useAll<{ id: string }>(query, writeMode === "command" ? { tier: "remote" } : undefined);
  const ids = data?.map((row) => row.id) ?? [];
  const fingerprint = ids.join("\u0000");
  useEffect(() => { onIds(ids); }, [fingerprint, onIds]);
  return null;
}
