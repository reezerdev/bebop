import { useEffect } from "react";
import { useAll, useDb } from "jazz-tools/react";
import { useForm } from "react-hook-form";
import { Link } from "react-router-dom";
import { app } from "../bebop-generated-schema.js";

const categories = ["announcement", "guide", "story"] as const;

type Category = (typeof categories)[number];
type PostFormValues = {
  title: string;
  authorId: string;
  body: string;
  slug: string;
  publishedAt: string;
  published: boolean;
  category: Category;
};
type AuthorOption = { id: string; name: string };

const dateTimeFormatter = new Intl.DateTimeFormat(undefined, {
  dateStyle: "medium",
  timeStyle: "short",
});
const dateFormatter = new Intl.DateTimeFormat(undefined, { dateStyle: "medium" });

export function PlaygroundPage({
  logout,
  currentUserId,
  currentUserName,
  authors,
}: {
  logout: () => void | Promise<void>;
  currentUserId: string;
  currentUserName: string;
  authors: readonly AuthorOption[];
}) {
  const db = useDb();
  const { data: posts } = useAll(app.posts.select("*", "$createdAt", "$updatedAt"));
  const { register, handleSubmit, reset, setValue, formState: { errors, dirtyFields, isSubmitting } } = useForm<PostFormValues>({
    defaultValues: {
      title: "",
      authorId: currentUserId,
      body: "",
      slug: "",
      publishedAt: "",
      published: false,
      category: "announcement",
    },
  });

  useEffect(() => {
    if (currentUserId && !dirtyFields.authorId) {
      setValue("authorId", currentUserId);
    }
  }, [currentUserId, dirtyFields.authorId, setValue]);

  function createPost(values: PostFormValues) {
    const title = values.title.trim();
    const body = values.body.trim();
    const slug = values.slug.trim();
    db.insert(app.posts, {
      title,
      authorId: values.authorId,
      published: values.published,
      category: values.category,
      ...(body ? { body } : {}),
      ...(slug ? { slug } : {}),
      ...(values.publishedAt
        ? { publishedAt: new Date(`${values.publishedAt}T00:00:00`) }
        : {}),
    });
    reset({
      title: "",
      authorId: currentUserId,
      body: "",
      slug: "",
      publishedAt: "",
      published: false,
      category: "announcement",
    });
  }

  const authorNames = new Map(authors.map((author) => [author.id, author.name]));
  if (currentUserId && currentUserName) authorNames.set(currentUserId, currentUserName);

  return (
    <main className="playground-shell">
      <header className="playground-topbar">
        <Link className="playground-wordmark" to="/" aria-label="Bebop home">bebop<span>♪</span></Link>
        <div className="playground-account-actions">
          <div className="playground-local-badge"><i /> Signed in</div>
          <Link className="playground-admin-link" to="/admin">Open admin <span>↗</span></Link>
          <button className="playground-signout-button" type="button" onClick={() => void logout()}>Sign out</button>
        </div>
      </header>

      <section className="playground-intro" id="top">
        <p className="playground-eyebrow">YOUR FIRST COLLECTION</p>
        <h1>Make something<br /><em>worth keeping.</em></h1>
        <p className="playground-lede">A tiny CMS playground. Change the collection in <code>bebop.config.ts</code>, regenerate the Jazz schema, and see your fields come alive here.</p>
      </section>

      <section className="playground-workspace" aria-label="Posts playground">
        <form className="playground-composer" onSubmit={handleSubmit(createPost)}>
          <div className="playground-section-label"><span>01</span> NEW POST</div>

          <label htmlFor="post-title">Title</label>
          <input
            id="post-title"
            {...register("title", { validate: (value) => value.trim().length > 0 || "Enter a title." })}
            placeholder="A thought worth sharing…"
            aria-invalid={Boolean(errors.title)}
          />
          {errors.title && <p className="playground-field-error" role="alert">{errors.title.message}</p>}

          <label htmlFor="post-author">Author</label>
          <select id="post-author" {...register("authorId", { required: "Choose an author." })} aria-invalid={Boolean(errors.authorId)}>
            <option value="">Select an author</option>
            {authors.map((author) => <option key={author.id} value={author.id}>{author.name}</option>)}
          </select>
          {errors.authorId && <p className="playground-field-error" role="alert">{errors.authorId.message}</p>}

          <label htmlFor="post-slug">Slug <span className="playground-optional">OPTIONAL</span></label>
          <input id="post-slug" {...register("slug")} placeholder="a-thought-worth-sharing" />

          <label htmlFor="post-category">Category</label>
          <select id="post-category" {...register("category")}>
            {categories.map((category) => <option key={category} value={category}>{category}</option>)}
          </select>

          <label htmlFor="post-published-at">Publish date <span className="playground-optional">OPTIONAL</span></label>
          <input id="post-published-at" type="date" {...register("publishedAt")} />

          <label className="playground-checkbox-field" htmlFor="post-published">
            <input id="post-published" type="checkbox" {...register("published")} />
            Publish immediately
          </label>

          <label htmlFor="post-body">Body <span className="playground-optional">OPTIONAL</span></label>
          <textarea id="post-body" {...register("body")} placeholder="Add a little more detail…" rows={4} />

          <button className="playground-create-button" type="submit" disabled={isSubmitting}>
            Create post <span>↗</span>
          </button>
          <p className="playground-form-note">Writes save instantly in this browser.</p>
        </form>

        <section className="playground-post-list" aria-live="polite">
          <div className="playground-list-heading">
            <div>
              <div className="playground-section-label"><span>02</span> YOUR COLLECTION</div>
              <h2>Posts <span className="playground-count">{posts?.length ?? 0}</span></h2>
            </div>
            <span className="playground-storage-label">LOCAL DATA</span>
          </div>

          {!posts?.length ? (
            <div className="playground-empty-state">
              <span className="playground-empty-icon">✳</span>
              <p>Your collection is ready.</p>
              <span>Create a post to see it appear here.</span>
            </div>
          ) : (
            <div className="playground-posts">
              {posts.map((post) => {
                const authorName = authorNames.get(post.authorId) ?? "Unknown author";
                return (
                  <article className="playground-post-card" key={post.id}>
                    <div className="playground-post-meta">
                      <span className={post.published ? "playground-status playground-status-live" : "playground-status"}>
                        <i /> {post.published ? "Published" : "Draft"}
                      </span>
                      <span className="playground-category">{post.category ?? "uncategorized"}</span>
                    </div>
                    <h3>{post.title}</h3>
                    <p className="playground-post-author">By {authorName}</p>
                    {post.slug && <p className="playground-post-slug">/{post.slug}</p>}
                    {post.body && <p className="playground-post-body">{post.body}</p>}
                    {post.publishedAt && (
                      <p className="playground-post-publish-date">
                        Publish date: <time dateTime={post.publishedAt.toISOString()}>{dateFormatter.format(post.publishedAt)}</time>
                      </p>
                    )}
                    <p className="playground-post-timestamps">
                      Created {dateTimeFormatter.format(post.$createdAt)} · Updated {dateTimeFormatter.format(post.$updatedAt)}
                    </p>
                    <div className="playground-post-actions">
                      <button
                        type="button"
                        onClick={() => db.update(app.posts, post.id, { published: !post.published })}
                      >
                        {post.published ? "Move to draft" : "Publish"}
                      </button>
                      <button className="playground-delete-action" type="button" onClick={() => db.delete(app.posts, post.id)}>
                        Delete
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>
      </section>

      <footer className="playground-footer">
        <span>Schema-driven content, compiled onto Jazz.</span>
        <span>PLAYGROUND / V0.1</span>
      </footer>
    </main>
  );
}
