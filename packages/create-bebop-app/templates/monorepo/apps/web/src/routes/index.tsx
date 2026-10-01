import { useMemo, useState, type FormEvent } from "react";
import { useAll, useDb } from "jazz-tools/react";
import { createFileRoute } from "@tanstack/react-router";
import { createBebopClient } from "../../bebop-generated-client.js";

export const Route = createFileRoute("/")({ component: Playground });

function Playground() {
  const db = useDb();
  const client = useMemo(() => createBebopClient(db), [db]);
  const { data: todos } = useAll(client.todos.query({ includeTimestamps: true, orderBy: { field: "$createdAt", direction: "desc" } }));
  const [title, setTitle] = useState("");
  const [error, setError] = useState("");

  async function addTodo(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = title.trim();
    if (!value) return;
    setError("");
    try {
      await client.todos.create({ title: value });
      setTitle("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not create todo.");
    }
  }

  return (
    <main className="page-shell">
      <header className="site-header"><a className="brand" href="/">bebop</a><a href="/admin">Open admin</a></header>
      <section className="intro">
        <p className="eyebrow">TANSTACK START · EXPO · JAZZ</p>
        <h1>A small app with<br /><em>a shared schema.</em></h1>
        <p>This workspace has a TanStack Start web app, an Expo native app, and the Bebop admin. They use one generated Jazz schema and typed client.</p>
      </section>
      <section className="todo-panel">
        <form onSubmit={addTodo}>
          <label htmlFor="todo-title">Add a todo</label>
          <div className="create-row">
            <input id="todo-title" value={title} onChange={(event) => setTitle(event.target.value)} placeholder="What are you working on?" />
            <button type="submit">Add</button>
          </div>
          {error && <p className="error" role="alert">{error}</p>}
        </form>
        <div className="list-heading"><h2>Todos</h2><span>{todos?.length ?? 0}</span></div>
        {!todos?.length ? <p className="empty">Your collection is empty. Add a todo or open the admin.</p> : (
          <ul className="todo-list">
            {todos.map((todo) => (
              <li key={todo.id}>
                <label className={todo.completed ? "todo todo-done" : "todo"}>
                  <input type="checkbox" checked={Boolean(todo.completed)} onChange={() => void client.todos.update(todo.id, { completed: !todo.completed })} />
                  <span>{todo.title}</span>
                </label>
                <button className="delete" type="button" aria-label={"Delete " + todo.title} onClick={() => void client.todos.delete(todo.id)}>Delete</button>
              </li>
            ))}
          </ul>
        )}
      </section>
      <footer className="site-footer"><span>Config: apps/web/bebop.config.ts</span><span>Jazz: {import.meta.env.VITE_JAZZ_APP_ID}</span></footer>
    </main>
  );
}
