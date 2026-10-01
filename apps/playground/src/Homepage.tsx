import type { ReactNode } from "react";

export function Homepage({
  children,
}: { children: ReactNode }) {
  return (
    <main className="bebop-admin min-h-screen bg-white text-slate-950">
      <header className="border-b border-slate-200">
        <div className="mx-auto flex min-h-16 max-w-7xl items-center justify-between gap-6 px-5 sm:px-8">
          <a className="text-2xl font-bold tracking-tight text-slate-950" href="#top" aria-label="Bebop home">
            bebop<span className="ml-1 align-top text-sm text-[#b45d7e]">♪</span>
          </a>
          <nav className="hidden items-center gap-8 text-sm font-medium text-slate-600 md:flex" aria-label="Main navigation">
            <a className="transition-colors hover:text-[#9e4b6b]" href="#product">Product</a>
            <a className="transition-colors hover:text-[#9e4b6b]" href="#demo">Docs</a>
            <a className="transition-colors hover:text-[#9e4b6b]" href="#pricing">Pricing</a>
          </nav>
          <a className="text-sm font-medium text-slate-600 transition-colors hover:text-[#9e4b6b] md:hidden" href="#demo">Explore playground</a>
        </div>
      </header>

      <section className="mx-auto max-w-5xl px-5 pb-14 pt-16 text-center sm:px-8 sm:pb-20 sm:pt-24" id="product">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#b45d7e]">A better way to ship your app</p>
        <h1 className="mx-auto mt-5 max-w-4xl text-5xl font-semibold tracking-tight text-slate-950 sm:text-7xl">
          Your data, <span className="text-[#b45d7e]">in sync.</span>
        </h1>
        <p className="mx-auto mt-6 max-w-2xl text-base leading-7 text-slate-600 sm:text-lg">
          Build with a schema-driven backend that keeps your app and its data moving together.
        </p>
        <a className="mt-8 inline-flex h-11 items-center justify-center rounded-md bg-[#b45d7e] px-5 text-sm font-semibold text-white transition-colors hover:bg-[#9e4b6b] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#b45d7e]" href="#demo">
          Explore the playground <span className="ml-2" aria-hidden="true">↓</span>
        </a>
        <p className="mt-5 text-sm text-slate-500">A live, hands-on look at Bebop</p>
      </section>

      <section className="border-y border-slate-200 bg-slate-50 px-4 py-12 sm:px-8 sm:py-16" id="demo" aria-label="Bebop playground demo">
        <div className="mx-auto mb-5 flex max-w-7xl flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#b45d7e]">The Bebop Playground</p>
            <p className="mt-2 text-sm text-slate-600">Switch workspaces, explore channels, and see messages take shape.</p>
          </div>
          <span className="text-xs text-slate-500">Try it below</span>
        </div>
        {children}
      </section>

      <footer className="mx-auto flex min-h-20 max-w-7xl flex-col items-start justify-center gap-2 px-5 text-sm text-slate-500 sm:flex-row sm:items-center sm:justify-between sm:px-8" id="pricing">
        <a className="text-lg font-bold tracking-tight text-slate-900" href="#top" aria-label="Bebop home">bebop<span className="ml-1 align-top text-xs text-[#b45d7e]">♪</span></a>
        <span>Schema-driven content, compiled onto Jazz.</span>
      </footer>
    </main>
  );
}
