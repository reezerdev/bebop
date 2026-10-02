import type { ReactNode } from "react";

export function Homepage({ children }: { children: ReactNode }) {
  return (
    <main className="bebop-admin min-h-screen bg-background text-foreground" id="top">
      <header className="border-b border-border">
        <div className="mx-auto flex min-h-16 max-w-7xl items-center justify-between gap-6 px-5 sm:px-8">
          <a className="font-heading text-2xl font-semibold tracking-wider text-foreground" href="#top" aria-label="Bebop home">
            bebop<span className="ml-1 align-top text-sm text-primary">♪</span>
          </a>
          <nav className="hidden items-center gap-8 text-sm font-medium text-muted-foreground md:flex" aria-label="Main navigation">
            <a className="transition-colors hover:text-foreground" href="#product">Product</a>
            <a className="transition-colors hover:text-foreground" href="#demo">Docs</a>
            <a className="transition-colors hover:text-foreground" href="#pricing">Pricing</a>
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

      <section className="border-b border-border bg-muted px-4 py-12 sm:px-8 sm:py-16" id="demo" aria-label="Bebop playground demo">
        {children}
        <div className="mx-auto mt-5 flex max-w-7xl flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">The Bebop Playground</p>
            <p className="mt-2 text-sm text-muted-foreground">Switch workspaces, explore channels, and see messages take shape.</p>
          </div>
        </div>
      </section>

      <footer className="mx-auto flex min-h-20 max-w-7xl flex-col items-start justify-center gap-2 px-5 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between sm:px-8" id="pricing">
        <a className="font-heading text-lg font-semibold tracking-wider text-foreground" href="#top" aria-label="Bebop home">bebop<span className="ml-1 align-top text-xs text-primary">♪</span></a>
        <span>Schema-driven content, compiled onto Jazz.</span>
      </footer>
    </main>
  );
}
