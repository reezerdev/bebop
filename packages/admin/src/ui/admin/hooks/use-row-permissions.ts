import { useState, useEffect } from "react";

import type { PermissionAdvice } from "jazz-tools";

import type { BebopAdminCollection } from "../../../types.js";

import type { AdminRecord, AdminTable, AdminDatabase } from "../data-access.js";

export function usePageRowPermissions(db: AdminDatabase, table: AdminTable | undefined, rows: readonly AdminRecord[], writeMode: BebopAdminCollection["writeMode"]) {
  const [permissions, setPermissions] = useState<Record<string, { update: PermissionAdvice; delete: PermissionAdvice }>>({});
  const rowFingerprint = rows.map((row) => JSON.stringify(row)).join("\u0000");

  useEffect(() => {
    let active = true;
    if (!table || rows.length === 0 || writeMode === "command") {
      setPermissions((current) => Object.keys(current).length ? {} : current);
      return;
    }
    setPermissions(Object.fromEntries(rows.map((row) => [row.id, { update: "unknown", delete: "unknown" }])));
    void Promise.all(rows.map(async (row) => {
      try {
        const [update, remove] = await Promise.all([
          db.canUpdate(table, row.id, row),
          db.canDelete(table, row.id),
        ]);
        return [row.id, { update, delete: remove }] as const;
      } catch {
        return [row.id, { update: "unknown", delete: "unknown" }] as const;
      }
    })).then((entries) => {
      if (active) setPermissions(Object.fromEntries(entries));
    });
    return () => { active = false; };
  }, [db, rowFingerprint, table, writeMode]);

  return permissions;
}

export function useRowReadPermissions(db: AdminDatabase, table: AdminTable | undefined, rows: readonly AdminRecord[]) {
  const [permissions, setPermissions] = useState<Record<string, PermissionAdvice>>({});
  const rowFingerprint = rows.map((row) => JSON.stringify(row)).join("\u0000");

  useEffect(() => {
    let active = true;
    if (!table || rows.length === 0) {
      setPermissions((current) => Object.keys(current).length ? {} : current);
      return;
    }
    setPermissions(Object.fromEntries(rows.map((row) => [row.id, "unknown"])));
    void Promise.all(rows.map(async (row) => {
      try {
        return [row.id, await db.canRead(table, row.id)] as const;
      } catch {
        return [row.id, "unknown" as const] as const;
      }
    })).then((entries) => {
      if (active) setPermissions(Object.fromEntries(entries));
    });
    return () => { active = false; };
  }, [db, rowFingerprint, table]);

  return permissions;
}
