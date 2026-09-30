

import { Plus } from "lucide-react";
import { Link } from "react-router-dom";
import type { BebopAdminManifest } from "../../../types.js";

export function DashboardPage({ manifest, canManageUsers }: { manifest: BebopAdminManifest; canManageUsers: boolean }) {
  const collections = Object.values(manifest.collections)
    .filter((collection) => !collection.auth || canManageUsers)
    .sort((left, right) => left.labels.plural.localeCompare(right.labels.plural));

  return (
    <section>
      <h1 className="mb-6 text-[32px] font-normal leading-tight tracking-tight">Collections</h1>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {collections.map((collection) => (
          <article key={collection.slug} className="flex min-h-40 items-start justify-between rounded-none border border-border bg-card p-5 text-card-foreground transition-colors hover:border-foreground/20">
            <Link to={`/admin/collections/${collection.slug}`} className="pt-1 text-base font-medium text-card-foreground no-underline hover:underline">{collection.labels.plural}</Link>
            <Link to={`/admin/collections/${collection.slug}/create`} className="flex size-9 shrink-0 items-center justify-center rounded-none border border-border text-card-foreground no-underline transition-colors hover:bg-accent" aria-label={`Create ${collection.labels.singular}`}>
              <Plus size={19} />
            </Link>
          </article>
        ))}
      </div>
    </section>
  );
}
