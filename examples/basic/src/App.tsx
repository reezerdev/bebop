import { useMemo, useState } from "react";
import { useDb, useAll } from "jazz-tools/react";
import { Link, Navigate, Route, Routes } from "react-router-dom";
import { BebopAdmin } from "@bebop/admin";
import { app } from "../bebop-generated-schema.js";
import { bebopAdminManifest } from "../bebop-admin-manifest.js";
import { createBebopClient } from "../bebop-generated-client.js";

function TodoPlayground({ client }: { client: ReturnType<typeof createBebopClient> }) {
  const { data: todos } = useAll(client.todos.query({ includeTimestamps: true, orderBy: { field: "$createdAt", direction: "desc" } }));
  const [title, setTitle] = useState("");
  const [error, setError] = useState<string>();

  async function createTodo(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = title.trim();
    if (!value) return;
    setError(undefined);
    try {
      await client.todos.create({ title: value });
      setTitle("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not create todo.");
    }
  }

  return (
    <main className="example-shell">
      <header className="example-header">
        <Link to="/" className="example-brand">bebop<span> / example</span></Link>
        <Link to="/admin" className="example-admin-link">Open admin ↗</Link>
      </header>
      <section className="example-intro">
        <p className="example-eyebrow">LOCAL PACKAGE EXAMPLE</p>
        <h1>One tiny list.<br /><em>Three Bebop packages.</em></h1>
        <p>This app imports the Bebop config, CLI-generated Jazz schema, typed client, and admin UI from workspace packages. It starts with a local-first Jazz account.</p>
      </section>
      <section className="example-content">
        <form className="example-form" onSubmit={createTodo}>
          <label htmlFor="todo-title">Add a todo</label>
          <div className="example-create-row">
            <input id="todo-title" value={title} onChange={(event) => setTitle(event.target.value)} placeholder="What are you working on?" />
            <button type="submit">Add</button>
          </div>
          {error && <p className="example-error" role="alert">{error}</p>}
        </form>
        <div className="example-list-heading"><h2>Todos</h2><span>{todos?.length ?? 0}</span></div>
        {!todos?.length ? <p className="example-empty">Your collection is empty. Add a todo or open the admin.</p> : (
          <ul className="example-list">
            {todos.map((todo) => <li key={todo.id}>
              <label className={todo.completed ? "example-todo example-todo-done" : "example-todo"}>
                <input type="checkbox" checked={Boolean(todo.completed)} onChange={() => void client.todos.update(todo.id, { completed: !todo.completed })} />
                <span>{todo.title}</span>
              </label>
              <button className="example-delete" type="button" aria-label={`Delete ${todo.title}`} onClick={() => void client.todos.delete(todo.id)}>Delete</button>
            </li>)}
          </ul>
        )}
      </section>
      <footer className="example-footer"><span>Config: <code>bebop.config.ts</code></span><span>Jazz app: {import.meta.env.VITE_JAZZ_APP_ID}</span></footer>
    </main>
  );
}

export function App() {
  const db = useDb();
  const client = useMemo(() => createBebopClient(db), [db]);
  return <Routes>
    <Route path="/" element={<TodoPlayground client={client} />} />
    <Route path="/admin/*" element={<BebopAdmin app={app} client={client} manifest={bebopAdminManifest} canAccessAdmin />} />
    <Route path="*" element={<Navigate to="/" replace />} />
  </Routes>;
}
