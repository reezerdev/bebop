import { ReactNode } from "react";

import type { BebopAdminField } from "../../../types.js";
import { Badge } from "../../../components/ui/badge.js";

import type { BebopAdminProps } from "../types.js";

import { formatDate, selectLabel } from "../record-values.js";

export function formatCell(field: BebopAdminField | undefined, value: unknown, relationOptions?: BebopAdminProps["relationOptions"]): ReactNode {
  if (value === null || value === undefined || value === "") return <span className="text-muted-foreground">—</span>;
  if (field?.kind === "boolean") return <Badge variant={value ? "default" : "secondary"}>{value ? "Yes" : "No"}</Badge>;
  if (field?.kind === "date") return formatDate(value);
  if (field?.kind === "json") return <span className="font-mono text-xs">{JSON.stringify(value)}</span>;
  if (field?.kind === "relation" || field?.kind === "upload") {
    const name = relationOptions?.[field.relationTo ?? ""]?.find((option) => option.id === value)?.name;
    return name ?? <span className="font-mono text-xs">{String(value).slice(0, 8)}</span>;
  }
  if (field?.kind === "select") return selectLabel(field, String(value));
  return String(value);
}
