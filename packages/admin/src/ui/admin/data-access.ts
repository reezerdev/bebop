import type { QueryBuilder } from "jazz-tools";
import type { PermissionAdvice } from "jazz-tools";
import type { BebopAdminClient } from "./types.js";

export type AdminRecord = Record<string, unknown> & { id: string; $createdAt?: Date; $updatedAt?: Date };
export type AdminTable = QueryBuilder<AdminRecord> & {
  select: (...columns: string[]) => QueryBuilder<AdminRecord>;
};
export type AdminDatabase = {
  canRead: (table: unknown, id: string) => Promise<PermissionAdvice>;
  canInsert: (table: unknown, data: Record<string, unknown>) => Promise<PermissionAdvice>;
  canUpdate: (table: unknown, id: string, data: Record<string, unknown>) => Promise<PermissionAdvice>;
  canDelete: (table: unknown, id: string) => Promise<PermissionAdvice>;
};

export type CollectionMutations = {
  query: (options?: { where?: Record<string, unknown>; orderBy?: { field: string; direction?: "asc" | "desc" }; limit?: number; offset?: number; includeTimestamps?: boolean }) => QueryBuilder<AdminRecord>;
  queryIds: (options?: { where?: Record<string, unknown> }) => QueryBuilder<{ id: string }>;
  search: (options: { search: string; fields: readonly string[]; where?: Record<string, unknown>; orderBy?: { field: string; direction?: "asc" | "desc" }; limit?: number; offset?: number }) => QueryBuilder<AdminRecord>;
  searchIds: (options: { search: string; fields: readonly string[]; where?: Record<string, unknown> }) => readonly QueryBuilder<{ id: string }>[];
  create: (data: Record<string, unknown>) => Promise<unknown>;
  update: (id: string, data: Record<string, unknown>) => Promise<unknown>;
  delete: (id: string) => Promise<unknown>;
};

export type RelationOption = { id: string; name: string };

export function getTable(app: object, collectionSlug: string): AdminTable | undefined {
  const table = (app as Record<string, unknown>)[collectionSlug];
  return table ? table as AdminTable : undefined;
}

export function getMutations(client: BebopAdminClient, collectionSlug: string): CollectionMutations | undefined {
  return (client as Record<string, unknown>)[collectionSlug] as CollectionMutations | undefined;
}
