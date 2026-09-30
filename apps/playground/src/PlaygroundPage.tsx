import { useEffect, useMemo, useState } from "react";
import { useAll } from "jazz-tools/react";
import { useForm } from "react-hook-form";
import { Link } from "react-router-dom";
import type { StreamClient } from "./stream-client.js";

type Client = StreamClient;
type UserOption = { id: string; name: string };
type WorkspaceForm = { name: string; slug: string };
type TaskForm = {
  name: string;
  workspaceId: string;
  content: string;
  priority: "" | "low" | "medium" | "high" | "urgent";
  parentTaskId: string;
  assigneeId: string;
  status: "backlog" | "todo" | "in-progress" | "in-review" | "done";
  dueAt: string;
};

const dateTimeFormatter = new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" });
const taskDefaults: TaskForm = {
  name: "", workspaceId: "", content: "", priority: "", parentTaskId: "", assigneeId: "", status: "todo", dueAt: "",
};

function slugify(value: string): string {
  return value.trim().toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

export function PlaygroundPage({
  client, logout, currentUserId, currentUserName, authors,
}: {
  client: Client;
  logout: () => void | Promise<void>;
  currentUserId: string;
  currentUserName: string;
  authors: readonly UserOption[];
}) {
  const { data: workspaces } = useAll(client.workspaces.query());
  const { data: tasks } = useAll(client.tasks.query({ includeTimestamps: true }));
  const { data: memberships } = useAll(client.workspaceMemberships.query());
  const [mutationError, setMutationError] = useState<string>();
  const workspaceForm = useForm<WorkspaceForm>({ defaultValues: { name: "", slug: "" } });
  const taskForm = useForm<TaskForm>({ defaultValues: { ...taskDefaults, assigneeId: currentUserId } });
  const { setValue, formState: { dirtyFields } } = taskForm;
  const selectedWorkspaceId = taskForm.watch("workspaceId");
  const workspaceNames = useMemo(() => new Map((workspaces ?? []).map((workspace) => [workspace.id, workspace.name])), [workspaces]);
  const authorNames = useMemo(() => {
    const names = new Map(authors.map((author) => [author.id, author.name]));
    if (currentUserId) names.set(currentUserId, currentUserName || "You");
    return names;
  }, [authors, currentUserId, currentUserName]);
  const activeTasks = (tasks ?? []).filter((task) => !task.archivedAt && (!selectedWorkspaceId || task.workspaceId === selectedWorkspaceId));
  const parentOptions = (tasks ?? []).filter((task) => !task.archivedAt && task.workspaceId === selectedWorkspaceId);

  useEffect(() => {
    if (workspaces?.length && !selectedWorkspaceId) setValue("workspaceId", workspaces[0].id);
  }, [selectedWorkspaceId, setValue, workspaces]);

  useEffect(() => {
    if (currentUserId && !dirtyFields.assigneeId) setValue("assigneeId", currentUserId);
  }, [currentUserId, dirtyFields.assigneeId, setValue]);

  useEffect(() => client.onMutationError((event) => {
    setMutationError(event.code === "permission_denied"
      ? "Jazz rejected a write because this session does not have access."
      : "Jazz could not sync a recent write. The local change may be reverted when sync finishes.");
  }), [client]);

  async function createWorkspace(values: WorkspaceForm) {
    setMutationError(undefined);
    const name = values.name.trim();
    const slug = slugify(values.slug || name);
    if (!slug) {
      workspaceForm.setError("slug", { message: "Enter a valid workspace slug." });
      return;
    }
    if ((workspaces ?? []).some((workspace) => workspace.slug === slug)) {
      workspaceForm.setError("slug", { message: "That workspace slug is already in use." });
      return;
    }
    try {
      const workspace = await client.workspaces.create({ name, slug });
      taskForm.setValue("workspaceId", workspace.doc.id);
      workspaceForm.reset({ name: "", slug: "" });
      if (currentUserId) {
        try {
          // Memberships are confirmed by the server, which must see the new
          // workspace before it can create a relationship to it.
          await workspace.waitForGlobal();
          await client.workspaceMemberships.create({ workspaceId: workspace.doc.id, userId: currentUserId, role: "admin", status: "active" });
        } catch (error) {
          setMutationError(error instanceof Error ? `Workspace created, but membership creation failed: ${error.message}` : "Workspace created, but membership creation failed.");
        }
      }
    } catch (error) {
      setMutationError(error instanceof Error ? error.message : "Could not create workspace.");
    }
  }

  async function createTask(values: TaskForm) {
    setMutationError(undefined);
    if (!currentUserId) {
      setMutationError("Sign in before creating a task.");
      return;
    }
    try {
      await client.tasks.create({
        name: values.name.trim(),
        workspaceId: values.workspaceId,
        authorId: currentUserId,
        status: values.status,
        ...(values.content.trim() ? { content: values.content.trim() } : {}),
        ...(values.priority ? { priority: values.priority } : {}),
        ...(values.parentTaskId ? { parentTaskId: values.parentTaskId } : {}),
        ...(values.assigneeId ? { assigneeId: values.assigneeId } : {}),
        ...(values.dueAt ? { dueAt: new Date(values.dueAt) } : {}),
      });
      taskForm.reset({ ...taskDefaults, workspaceId: values.workspaceId, assigneeId: currentUserId });
    } catch (error) {
      setMutationError(error instanceof Error ? error.message : "Could not create task.");
    }
  }

  async function updateTask(id: string, data: Parameters<Client["tasks"]["update"]>[1]) {
    setMutationError(undefined);
    try { await client.tasks.update(id, data); }
    catch (error) { setMutationError(error instanceof Error ? error.message : "Could not update task."); }
  }

  async function deleteTask(id: string) {
    setMutationError(undefined);
    try { await client.tasks.delete(id); }
    catch (error) { setMutationError(error instanceof Error ? error.message : "Could not delete task."); }
  }

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
        <p className="playground-eyebrow">YOUR FIRST COLLECTIONS</p>
        <h1>Make something<br /><em>worth doing.</em></h1>
        <p className="playground-lede">Create a workspace, add tasks, then open Bebop admin to edit your documents and memberships.</p>
      </section>

      <section className="playground-workspace" aria-label="Tasks playground">
        <div className="playground-composer">
          {mutationError && <p className="playground-field-error" role="alert">{mutationError}</p>}
          <form onSubmit={workspaceForm.handleSubmit(createWorkspace)}>
            <div className="playground-section-label"><span>01</span> NEW WORKSPACE</div>
            <label htmlFor="workspace-name">Name</label>
            <input id="workspace-name" {...workspaceForm.register("name", { validate: (value) => !!value.trim() || "Enter a workspace name." })} placeholder="My workspace" />
            {workspaceForm.formState.errors.name && <p className="playground-field-error" role="alert">{workspaceForm.formState.errors.name.message}</p>}
            <label htmlFor="workspace-slug">Slug <span className="playground-optional">OPTIONAL</span></label>
            <input id="workspace-slug" {...workspaceForm.register("slug")} placeholder="my-workspace" />
            {workspaceForm.formState.errors.slug && <p className="playground-field-error" role="alert">{workspaceForm.formState.errors.slug.message}</p>}
            <button className="playground-create-button" type="submit" disabled={workspaceForm.formState.isSubmitting}>Create workspace <span>↗</span></button>
          </form>

          <form className="playground-task-form" onSubmit={taskForm.handleSubmit(createTask)}>
            <div className="playground-section-label"><span>02</span> NEW TASK</div>
            <label htmlFor="task-workspace">Workspace</label>
            <select id="task-workspace" {...taskForm.register("workspaceId", { required: "Create or choose a workspace." })}>
              <option value="">Select a workspace</option>
              {(workspaces ?? []).map((workspace) => <option key={workspace.id} value={workspace.id}>{workspace.name}</option>)}
            </select>
            {taskForm.formState.errors.workspaceId && <p className="playground-field-error" role="alert">{taskForm.formState.errors.workspaceId.message}</p>}
            <label htmlFor="task-name">Name</label>
            <input id="task-name" {...taskForm.register("name", { validate: (value) => !!value.trim() || "Enter a task name." })} placeholder="Plan the next release" />
            {taskForm.formState.errors.name && <p className="playground-field-error" role="alert">{taskForm.formState.errors.name.message}</p>}
            <label htmlFor="task-content">Content <span className="playground-optional">OPTIONAL</span></label>
            <textarea id="task-content" {...taskForm.register("content")} rows={4} placeholder="What needs to happen?" />
            <label htmlFor="task-status">Status</label>
            <select id="task-status" {...taskForm.register("status")}>
              <option value="backlog">Backlog</option><option value="todo">To Do</option><option value="in-progress">In Progress</option><option value="in-review">In Review</option><option value="done">Done</option>
            </select>
            <label htmlFor="task-priority">Priority <span className="playground-optional">OPTIONAL</span></label>
            <select id="task-priority" {...taskForm.register("priority")}>
              <option value="">No priority</option><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option><option value="urgent">Urgent</option>
            </select>
            <label htmlFor="task-assignee">Assignee <span className="playground-optional">OPTIONAL</span></label>
            <select id="task-assignee" {...taskForm.register("assigneeId")}>
              <option value="">Unassigned</option>
              {authors.map((author) => <option key={author.id} value={author.id}>{author.name}</option>)}
            </select>
            <label htmlFor="task-parent">Parent task <span className="playground-optional">OPTIONAL</span></label>
            <select id="task-parent" {...taskForm.register("parentTaskId")}>
              <option value="">No parent</option>
              {parentOptions.map((task) => <option key={task.id} value={task.id}>{task.name}</option>)}
            </select>
            <label htmlFor="task-due-at">Due at <span className="playground-optional">OPTIONAL</span></label>
            <input id="task-due-at" type="datetime-local" {...taskForm.register("dueAt")} />
            <button className="playground-create-button" type="submit" disabled={taskForm.formState.isSubmitting || !workspaces?.length}>Create task <span>↗</span></button>
            <p className="playground-form-note">Author: {currentUserName || "current user"}. Writes save locally first.</p>
          </form>
        </div>

        <section className="playground-post-list" aria-live="polite">
          <div className="playground-list-heading">
            <div><div className="playground-section-label"><span>03</span> YOUR TASKS</div><h2>Tasks <span className="playground-count">{activeTasks.length}</span></h2></div>
            <span className="playground-storage-label">LOCAL DATA</span>
          </div>
          <p className="playground-form-note">{(memberships ?? []).filter((membership) => membership.userId === currentUserId && membership.status === "active").length} active workspace memberships</p>
          {!activeTasks.length ? (
            <div className="playground-empty-state"><span className="playground-empty-icon">✳</span><p>No tasks yet.</p><span>Create a workspace and your first task.</span></div>
          ) : (
            <div className="playground-posts">
              {activeTasks.map((task) => <article className="playground-post-card" key={task.id}>
                <div className="playground-post-meta"><span className={task.status === "done" ? "playground-status playground-status-live" : "playground-status"}><i /> {(task.status ?? "todo").replaceAll("-", " ")}</span><span className="playground-category">{task.priority ?? "No priority"}</span></div>
                <h3>{task.name}</h3>
                <p className="playground-post-author">{workspaceNames.get(task.workspaceId ?? "") ?? "No workspace"} · Created by {authorNames.get(task.authorId) ?? "Unknown user"}{task.assigneeId ? ` · Assigned to ${authorNames.get(task.assigneeId) ?? "Unknown user"}` : ""}</p>
                {task.content && <p className="playground-post-body">{task.content}</p>}
                {task.dueAt && <p className="playground-post-publish-date">Due {dateTimeFormatter.format(task.dueAt)}</p>}
                <p className="playground-post-timestamps">Created {task.$createdAt ? dateTimeFormatter.format(task.$createdAt) : "locally"}</p>
                <div className="playground-post-actions">
                  <button type="button" onClick={() => void updateTask(task.id, { status: task.status === "done" ? "todo" : "done" })}>{task.status === "done" ? "Move to To Do" : "Mark done"}</button>
                  <button type="button" onClick={() => void updateTask(task.id, { archivedAt: new Date() })}>Archive</button>
                  <button className="playground-delete-action" type="button" onClick={() => void deleteTask(task.id)}>Delete</button>
                </div>
              </article>)}
            </div>
          )}
        </section>
      </section>
      <footer className="playground-footer"><span>Schema-driven content, compiled onto Jazz.</span><span>PLAYGROUND / V0.1</span></footer>
    </main>
  );
}
