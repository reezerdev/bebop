import { useAll, useDb, useJazzAuth } from "jazz-tools/react";
import { useForm } from "react-hook-form";
import { app } from "../bebop-generated-schema.js";

const categories = ["announcement", "guide", "story"] as const;

type PostFormValues = {
  title: string;
  body: string;
  slug: string;
  publishedAt: string;
  published: boolean;
  category: (typeof categories)[number];
};

const dateTimeFormatter = new Intl.DateTimeFormat(undefined, {
  dateStyle: "medium",
  timeStyle: "short",
});
const dateFormatter = new Intl.DateTimeFormat(undefined, { dateStyle: "medium" });

export function App() {
  const db = useDb();
  const { logout } = useJazzAuth();
  const { data: posts } = useAll(app.posts.select("*", "$createdAt", "$updatedAt"));
  const { register, handleSubmit, reset, formState: { errors } } = useForm<PostFormValues>({
    defaultValues: {
      title: "",
      body: "",
      slug: "",
      publishedAt: "",
      published: false,
      category: "announcement",
    },
  });

  function createPost(values: PostFormValues) {
    const title = values.title.trim();
    const body = values.body.trim();
    const slug = values.slug.trim();

    db.insert(app.posts, {
      title,
      published: values.published,
      category: values.category,
      ...(body ? { body } : {}),
      ...(slug ? { slug } : {}),
      ...(values.publishedAt
        ? { publishedAt: new Date(`${values.publishedAt}T00:00:00`) }
        : {}),
    });
    reset();
  }

  return (
    <main className="shell">
      <header className="topbar">
        <a className="wordmark" href="#top" aria-label="Bebop home">bebop<span>♪</span></a>
        <div className="account-actions">
          <div className="local-badge"><i /> Signed in</div>
          <button className="signout-button" type="button" onClick={() => void logout()}>Sign out</button>
        </div>
      </header>

      <section className="intro" id="top">
        <p className="eyebrow">YOUR FIRST COLLECTION</p>
        <h1>Make something<br /><em>worth keeping.</em></h1>
        <p className="lede">A tiny CMS playground. Change the collection in <code>bebop.config.ts</code>, regenerate the Jazz schema, and see your fields come alive here.</p>
      </section>

      <section className="workspace" aria-label="Posts playground">
        <form className="composer" onSubmit={handleSubmit(createPost)}>
          <div className="section-label"><span>01</span> NEW POST</div>

          <label htmlFor="post-title">Title</label>
          <input
            id="post-title"
            {...register("title", {
              validate: (value) => value.trim().length > 0 || "Enter a title.",
            })}
            placeholder="A thought worth sharing…"
            aria-invalid={Boolean(errors.title)}
          />
          {errors.title && <p className="field-error" role="alert">{errors.title.message}</p>}

          <label htmlFor="post-slug">Slug <span className="optional">OPTIONAL</span></label>
          <input
            id="post-slug"
            {...register("slug")}
            placeholder="a-thought-worth-sharing"
          />

          <label htmlFor="post-category">Category</label>
          <select id="post-category" {...register("category")}>
            {categories.map((category) => (
              <option key={category} value={category}>{category}</option>
            ))}
          </select>

          <label htmlFor="post-published-at">Publish date <span className="optional">OPTIONAL</span></label>
          <input id="post-published-at" type="date" {...register("publishedAt")} />

          <label className="checkbox-field" htmlFor="post-published">
            <input id="post-published" type="checkbox" {...register("published")} />
            Publish immediately
          </label>

          <label htmlFor="post-body">Body <span className="optional">OPTIONAL</span></label>
          <textarea
            id="post-body"
            {...register("body")}
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
                  {post.slug && <p className="post-slug">/{post.slug}</p>}
                  {post.body && <p className="post-body">{post.body}</p>}
                  {post.publishedAt && (
                    <p className="post-publish-date">
                      Publish date: <time dateTime={post.publishedAt.toISOString()}>{dateFormatter.format(post.publishedAt)}</time>
                    </p>
                  )}
                  <p className="post-timestamps">
                    Created {dateTimeFormatter.format(post.$createdAt)} · Updated {dateTimeFormatter.format(post.$updatedAt)}
                  </p>
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
