import { useAll } from "jazz-tools/react";

import type { BebopAdminCollection } from "../../../types.js";

import type { BebopAdminClient } from "../types.js";
import type { AdminRecord } from "../data-access.js";
import { getMutations } from "../data-access.js";
import { defaultPageSize } from "../constants.js";
import { pageWithLookahead } from "../pagination.js";

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
  const pageSize = options.pageSize ?? defaultPageSize;
  const offset = ((options.page ?? 1) - 1) * pageSize;
  const searchPageQuery = options.enabled === false || !options.searchActive ? undefined : operations?.search({
    search: options.search ?? "",
    fields: options.searchFields ?? [],
    where: options.where,
    orderBy: options.sort,
    limit: pageSize + 1,
    offset,
  });
  const searchPage = useAll<AdminRecord>(searchPageQuery, readOptions);
  const searchRows = pageWithLookahead(searchPage.data ?? [], pageSize);
  const hasNextPage = searchRows.hasNextPage;
  const pageIds = searchRows.rows.map((row) => row.id);
  const query = options.enabled === false ? undefined : options.searchActive
    ? pageIds.length ? operations?.query({ where: { ...options.where, id: { in: pageIds } }, includeTimestamps: true }) : undefined
    : operations?.query({
      where: options.where,
      orderBy: options.sort,
      includeTimestamps: true,
      limit: pageSize + 1,
      offset,
    });
  const docs = useAll<AdminRecord>(query, readOptions);
  const ordinaryRows = pageWithLookahead(docs.data ?? [], pageSize);
  const docsById = new Map((docs.data ?? []).map((row) => [row.id, row]));
  const orderedRows = options.searchActive ? pageIds.flatMap((id) => {
    const row = docsById.get(id);
    return row ? [row] : [];
  }) : docs.data;
  const rows = options.searchActive
    ? { ...docs, data: orderedRows, isLoading: searchPage.isLoading || docs.isLoading, error: searchPage.error ?? docs.error }
    : { ...docs, data: ordinaryRows.rows };
  return { rows, hasNextPage: options.searchActive ? hasNextPage : ordinaryRows.hasNextPage };
}
