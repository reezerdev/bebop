import { useCallback, useRef, useState } from "react";

import { ArrowLeft, ChevronRight, ChevronUp, LogOut, Menu } from "lucide-react";
import { Link, NavLink, Outlet, useLocation } from "react-router-dom";
import type { BebopAdminManifest } from "../../../types.js";

import { Button } from "../../../components/ui/button.js";

import { Toaster } from "../../../components/ui/toast.js";

import { AdminPortalContainer } from "../../../lib/admin-portal.js";

import type { BebopAdminProps, AdminOutletContext } from "../types.js";

export function AdminLayout({
  manifest,
  canManageUsers,
  user,
  onLogout,
  mutationError,
}: {
  manifest: BebopAdminManifest;
  canManageUsers: boolean;
  user?: BebopAdminProps["user"];
  onLogout?: BebopAdminProps["onLogout"];
  mutationError?: string;
}) {
  const portalContainer = useRef<HTMLDivElement>(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [collectionsOpen, setCollectionsOpen] = useState(true);
  const [documentBreadcrumb, setDocumentBreadcrumbState] = useState<{ path: string; title: string }>();
  const location = useLocation();
  const setDocumentBreadcrumb = useCallback((title: string | undefined) => {
    setDocumentBreadcrumbState(title ? { path: location.pathname, title } : undefined);
  }, [location.pathname]);
  const currentDocumentBreadcrumb = documentBreadcrumb?.path === location.pathname ? documentBreadcrumb.title : undefined;
  const activeCollection = location.pathname.match(/\/collections\/([^/]+)/)?.[1];
  const currentCollection = activeCollection ? manifest.collections[activeCollection] : undefined;
  const isCreateRoute = location.pathname.endsWith("/create");
  const isDocumentRoute = Boolean(currentCollection && location.pathname.match(/\/collections\/[^/]+\/[^/]+\/?$/) && !isCreateRoute);
  const collections = Object.values(manifest.collections)
    .filter((collection) => !collection.auth || canManageUsers)
    .sort((left, right) => left.labels.plural.localeCompare(right.labels.plural));
  const userName = user?.name?.trim() || "Signed in";
  const userEmail = user?.email?.trim() || "Email unavailable";
  const avatarInitials = (user?.name?.trim() || user?.email?.trim() || "U")
    .split(/[\s@._-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();

  return (
    <AdminPortalContainer.Provider value={portalContainer}>
    <Toaster>
    <div ref={portalContainer} className="bebop-admin min-h-svh bg-background font-sans text-foreground">
      <aside className={`fixed inset-y-0 left-0 z-40 flex w-68 flex-col border-r border-sidebar-border bg-background text-sidebar-foreground transition-transform duration-200 ${sidebarCollapsed ? "-translate-x-full" : ""} ${mobileOpen ? "max-md:translate-x-0" : "max-md:-translate-x-full"}`}>
        <div className="flex h-12 shrink-0 items-center px-4 max-md:hidden">
          <Button variant="outline" size="icon-xs" aria-label="Collapse sidebar" onClick={() => setSidebarCollapsed(true)}>
            <ArrowLeft size={18} />
          </Button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 pt-1 pb-6">
          <button className="mb-1 flex w-full items-center justify-between bg-transparent py-1 text-left text-[13px] text-muted-foreground hover:text-foreground" aria-expanded={collectionsOpen} onClick={() => setCollectionsOpen((open) => !open)}>
            <span>Collections</span><ChevronUp size={16} className={collectionsOpen ? "" : "rotate-180"} />
          </button>
          {collectionsOpen && <nav aria-label="Collections" className="flex flex-col">
            {collections.map((collection) => (
              <NavLink
                key={collection.slug}
                to={`/admin/collections/${collection.slug}`}
                className={({ isActive }) => `relative flex min-h-7 items-center text-[13px] leading-5 no-underline transition-colors hover:text-foreground ${isActive ? "font-semibold text-foreground before:absolute before:-left-5 before:top-1/2 before:h-3 before:w-0.5 before:-translate-y-1/2 before:bg-foreground before:content-['']" : "font-normal text-sidebar-foreground/85"}`}
                onClick={() => setMobileOpen(false)}
              >
                <span className="truncate">{collection.labels.plural}</span>
              </NavLink>
            ))}
          </nav>}
        </div>
        <div className="flex items-center gap-3 border-t border-sidebar-border px-4 py-3">
          <div className="flex size-8 shrink-0 items-center justify-center rounded-none bg-sidebar-accent text-xs font-semibold text-sidebar-accent-foreground">{avatarInitials}</div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-sidebar-foreground">{userName}</p>
            <p className="truncate text-xs text-sidebar-foreground/60">{userEmail}</p>
          </div>
          {onLogout && (
            <Button variant="ghost" size="icon" className="text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground" aria-label="Sign out" onClick={() => void onLogout()}>
              <LogOut size={16} />
            </Button>
          )}
        </div>
      </aside>
      {mobileOpen && <button className="hidden max-md:fixed max-md:inset-0 max-md:z-30 max-md:block max-md:bg-black/30" aria-label="Close navigation" onClick={() => setMobileOpen(false)} />}
      <div className={`min-h-svh transition-[padding] duration-200 max-md:pl-0 ${sidebarCollapsed ? "pl-0" : "pl-68"}`}>
        <header className="sticky top-0 z-20 flex h-12 items-center bg-background px-6 lg:px-15 max-md:px-3">
          <Button variant="ghost" size="icon" className="hidden max-md:mr-2 max-md:inline-flex" aria-label="Open navigation" onClick={() => setMobileOpen(true)}>
            <Menu size={18} />
          </Button>
          {sidebarCollapsed && <Button variant="outline" size="icon" className="mr-3 max-md:hidden" aria-label="Expand sidebar" onClick={() => setSidebarCollapsed(false)}><ChevronRight size={18} /></Button>}
          <div className="flex items-center gap-3 text-[13px] font-normal">
            <Link to="/admin" className="flex size-8 items-center justify-center rounded-none bg-foreground text-base font-bold lowercase text-background no-underline" aria-label="Bebop dashboard">b</Link>
            <span className="text-muted-foreground">/</span>
            {currentCollection ? <Link to={`/admin/collections/${currentCollection.slug}`} className="hover:underline">{currentCollection.labels.plural}</Link> : <span>Dashboard</span>}
            {(isCreateRoute || isDocumentRoute) && <><span className="text-muted-foreground">/</span><span className="max-w-56 truncate" title={currentDocumentBreadcrumb}>{isCreateRoute ? `New ${currentCollection?.labels.singular ?? "document"}` : currentDocumentBreadcrumb ?? "Document"}</span></>}
            {activeCollection && !currentCollection && <span>Not found</span>}
          </div>
        </header>
        <main className="mx-auto w-full max-w-[1440px] px-6 pt-2 pb-6 lg:px-15 max-md:p-4">
          {mutationError && <div className="mb-5 border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive" role="alert">{mutationError}</div>}
          <Outlet context={{ setDocumentBreadcrumb } satisfies AdminOutletContext} />
        </main>
      </div>
    </div>
    </Toaster>
    </AdminPortalContainer.Provider>
  );
}
