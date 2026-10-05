import { useState, type ReactNode } from "react";

const createCommand = "npx @bebopdev/create-bebop-app@beta my-app";

export function Homepage({ children }: { children: ReactNode }) {
  const [commandCopied, setCommandCopied] = useState(false);

  async function copyCreateCommand() {
    try {
      await navigator.clipboard.writeText(createCommand);
      setCommandCopied(true);
      window.setTimeout(() => setCommandCopied(false), 2000);
    } catch {
      setCommandCopied(false);
    }
  }

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
        <div className="mx-auto mt-10 flex max-w-3xl items-stretch border border-border bg-card text-left">
          <code className="min-w-0 flex-1 overflow-x-auto px-4 py-4 font-mono text-xs text-foreground sm:px-6 sm:text-sm">{createCommand}</code>
          <button
            className="shrink-0 border-l border-border px-4 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-ring sm:px-7"
            type="button"
            onClick={() => void copyCreateCommand()}
            aria-live="polite"
          >
            {commandCopied ? "Copied" : "Copy"}
          </button>
        </div>
      </section>

      <section className="mx-auto grid max-w-7xl items-center gap-10 px-5 py-16 sm:px-8 sm:py-20 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:gap-16" aria-labelledby="config-heading">
        <div>
          <h2 className="font-heading max-w-xl text-3xl font-semibold tracking-tight text-foreground sm:text-4xl" id="config-heading">
            Model the playground in a few lines.
          </h2>
          <p className="mt-5 max-w-xl text-base leading-7 text-muted-foreground sm:text-lg">
            Workspaces own channels, channels point to a stream, and entries belong to that stream—all defined in <code className="font-mono text-sm text-foreground">bebop.config.ts</code>.
          </p>
        </div>
        <div className="min-w-0 overflow-hidden border border-border bg-card">
          <div className="border-b border-border px-5 py-3 font-mono text-xs text-muted-foreground">bebop.config.ts</div>
          <pre className="overflow-x-auto p-5 font-mono text-[11px] leading-6 text-foreground sm:p-6 sm:text-xs"><code>
            <span className="block"><span className="text-violet-400">import</span>{" { defineConfig } "}<span className="text-violet-400">from</span>{" "}<span className="text-emerald-300">"@bebopdev/core"</span>;</span>
            <span className="block h-6" />
            <span className="block"><span className="text-violet-400">export default</span>{" "}<span className="text-sky-300">defineConfig</span>({"{"}</span>
            <span className="block">{"  "}<span className="text-sky-300">collections</span>: [</span>
            <span className="block">{"    { "}<span className="text-sky-300">slug</span>: <span className="text-emerald-300">"workspaces"</span>,</span>
            <span className="block">{"      "}<span className="text-sky-300">fields</span>: [{" { "}<span className="text-sky-300">name</span>: <span className="text-emerald-300">"name"</span>, <span className="text-sky-300">type</span>: <span className="text-emerald-300">"text"</span> }],</span>
            <span className="block">{"    },"}</span>
            <span className="block">{"    { "}<span className="text-sky-300">slug</span>: <span className="text-emerald-300">"channels"</span>,</span>
            <span className="block">{"      "}<span className="text-sky-300">fields</span>: [</span>
            <span className="block">{"        { "}<span className="text-sky-300">name</span>: <span className="text-emerald-300">"name"</span>, <span className="text-sky-300">type</span>: <span className="text-emerald-300">"text"</span> },</span>
            <span className="block">{"        { "}<span className="text-sky-300">name</span>: <span className="text-emerald-300">"workspace"</span>, <span className="text-sky-300">type</span>: <span className="text-emerald-300">"relationship"</span>, <span className="text-sky-300">relationTo</span>: <span className="text-emerald-300">"workspaces"</span> },</span>
            <span className="block">{"        { "}<span className="text-sky-300">name</span>: <span className="text-emerald-300">"stream"</span>, <span className="text-sky-300">type</span>: <span className="text-emerald-300">"relationship"</span>, <span className="text-sky-300">relationTo</span>: <span className="text-emerald-300">"streams"</span> },</span>
            <span className="block">{"      ],\n    },"}</span>
            <span className="block">{"    { "}<span className="text-sky-300">slug</span>: <span className="text-emerald-300">"streams"</span>,</span>
            <span className="block">{"      "}<span className="text-sky-300">fields</span>: [</span>
            <span className="block">{"        { "}<span className="text-sky-300">name</span>: <span className="text-emerald-300">"workspace"</span>, <span className="text-sky-300">type</span>: <span className="text-emerald-300">"relationship"</span>, <span className="text-sky-300">relationTo</span>: <span className="text-emerald-300">"workspaces"</span> },</span>
            <span className="block">{"        { "}<span className="text-sky-300">name</span>: <span className="text-emerald-300">"entries"</span>, <span className="text-sky-300">type</span>: <span className="text-emerald-300">"join"</span>, <span className="text-sky-300">collection</span>: <span className="text-emerald-300">"entries"</span>, <span className="text-sky-300">on</span>: <span className="text-emerald-300">"stream"</span> },</span>
            <span className="block">{"      ],\n    },"}</span>
            <span className="block">{"    { "}<span className="text-sky-300">slug</span>: <span className="text-emerald-300">"entries"</span>,</span>
            <span className="block">{"      "}<span className="text-sky-300">fields</span>: [</span>
            <span className="block">{"        { "}<span className="text-sky-300">name</span>: <span className="text-emerald-300">"stream"</span>, <span className="text-sky-300">type</span>: <span className="text-emerald-300">"relationship"</span>, <span className="text-sky-300">relationTo</span>: <span className="text-emerald-300">"streams"</span> },</span>
            <span className="block">{"        { "}<span className="text-sky-300">name</span>: <span className="text-emerald-300">"content"</span>, <span className="text-sky-300">type</span>: <span className="text-emerald-300">"text"</span> },</span>
            <span className="block">{"      ],\n    },\n  ],\n});"}</span>
          </code></pre>
        </div>
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
