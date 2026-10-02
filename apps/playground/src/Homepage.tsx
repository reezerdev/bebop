import type { ReactNode } from "react";

export function Homepage({ children }: { children: ReactNode }) {
  return (
    <main className="bebop-admin min-h-screen bg-background text-foreground" id="top">
      <header>
        <div className="mx-auto flex min-h-16 max-w-7xl items-center justify-between gap-6 px-5 sm:px-8">
          <a className="inline-flex items-center text-foreground" href="#top" aria-label="Bebop home">
            <img className="h-10 w-[117px] shrink-0" src="/Logotype.svg" alt="" />
          </a>
          <nav className="hidden items-center gap-8 text-sm font-medium text-muted-foreground md:flex" aria-label="Main navigation">
            <a className="transition-colors hover:text-foreground" href="#demo">Docs</a>
          </nav>
          <a className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground md:hidden" href="#demo">Explore playground</a>
        </div>
      </header>

      <section className="mx-auto max-w-5xl px-5 pb-14 pt-16 text-center sm:px-8 sm:pb-20 sm:pt-24" id="product">
        <h1 className="font-heading mx-auto max-w-4xl text-5xl font-semibold tracking-tight text-foreground sm:text-7xl">
          Build local-first. <span className="text-primary">Keep your data in sync.</span>
        </h1>
        <p className="mx-auto mt-6 max-w-2xl text-base leading-7 text-muted-foreground sm:text-lg">
          A schema-driven backend with a built-in admin panel to manage your data, users, and app—all in one place.
        </p>
        <a className="mt-8 inline-flex h-11 items-center justify-center bg-primary px-5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/80 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring" href="#demo">
          Explore the playground <span className="ml-2" aria-hidden="true">↓</span>
        </a>
        <p className="mt-5 text-sm text-muted-foreground">A live, hands-on look at Bebop.</p>
      </section>

      <section className="bg-muted px-4 py-12 sm:px-8 sm:py-16" id="demo" aria-label="Bebop playground demo">
        {children}
        <div className="mx-auto mt-10 w-full max-w-[1000px]">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">The Bebop Playground</p>
          <p className="mt-2 text-sm text-muted-foreground">Switch workspaces, explore channels, and see messages take shape.</p>
        </div>
      </section>

      <footer className="mx-auto mt-[132px] flex min-h-20 max-w-7xl flex-col items-start justify-center gap-2 px-5 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between sm:px-8" id="pricing">
        <span>© 2026 Reezer</span>
      </footer>
    </main>
  );
}
