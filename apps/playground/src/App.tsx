import { useState, type FormEvent } from "react";
import { useAll, useDb } from "jazz-tools/react";
import { app } from "../schema.js";

export function App() {
  const db = useDb();
  const { data: posts } = useAll(app.posts);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");

  function createPost(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const cleanTitle = title.trim();
    if (!cleanTitle) return;

    db.insert(app.posts, {
      title: cleanTitle,
      body: body.trim(),
      published: false,
      category: "announcement",
    });
    setTitle("");
    setBody("");
  }

  return (
    <main className="shell">
      <header className="topbar">
        <a className="wordmark" href="#top" aria-label="Bebop home">bebop<span>♪</span></a>
        <div className="local-badge"><i /> Local playground</div>
      </header>

      <section className="intro" id="top">
        <p className="eyebrow">YOUR FIRST COLLECTION</p>
        <h1>Make something<br /><em>worth keeping.</em></h1>
        <p className="lede">A tiny CMS playground. Change the collection in <code>bebop.config.ts</code>, regenerate the Jazz schema, and see your fields come alive here.</p>
      </section>

      <section className="workspace" aria-label="Posts playground">
        <form className="composer" onSubmit={createPost}>
          <div className="section-label"><span>01</span> NEW POST</div>
          <label htmlFor="post-title">Title</label>
          <input
            id="post-title"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="A thought worth sharing…"
            required
          />
          <label htmlFor="post-body">Body <span className="optional">OPTIONAL</span></label>
          <textarea
            id="post-body"
            value={body}
            onChange={(event) => setBody(event.target.value)}
            placeholder="Add a little more detail…"
            rows={4}
          />
          <button className="create-button" type="submit">Create post <span>↗</span></button>
          <p className="form-note">Writes save instantly in this browser.</p>
        </form>

        <section className="post-list" aria-live="polite">
          <div className="list-heading">
            <div>
              <div className="section-label"><span>02</span> YOUR COLLECTION</div>
              <h2>Posts <span className="count">{posts?.length ?? 0}</span></h2>
            </div>
            <span className="storage-label">LOCAL DATA</span>
          </div>

          {!posts?.length ? (
            <div className="empty-state">
              <span className="empty-icon">✳</span>
              <p>Your collection is ready.</p>
              <span>Create a post to see it appear here.</span>
            </div>
          ) : (
            <div className="posts">
              {posts.map((post) => (
                <article className="post-card" key={post.id}>
                  <div className="post-meta">
                    <span className={post.published ? "status status-live" : "status"}>
                      <i /> {post.published ? "Published" : "Draft"}
                    </span>
                    <span className="category">{post.category ?? "uncategorized"}</span>
                  </div>
                  <h3>{post.title}</h3>
                  {post.body && <p className="post-body">{post.body}</p>}
                  <div className="post-actions">
                    <button
                      type="button"
                      onClick={() => db.update(app.posts, post.id, { published: !post.published })}
                    >
                      {post.published ? "Move to draft" : "Publish"}
                    </button>
                    <button className="delete-action" type="button" onClick={() => db.delete(app.posts, post.id)}>
                      Delete
                    </button>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      </section>

      <footer className="footer">
        <span>Schema-driven content, compiled onto Jazz.</span>
        <span>PLAYGROUND / V0.1</span>
      </footer>
    </main>
  );
}
