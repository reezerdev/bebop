import { useEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { useAll } from "jazz-tools/react";
import { useForm } from "react-hook-form";
import {
  ArrowUp,
  ArrowUpRight,
  Check,
  FaceSmile,
  Hash01,
  LockKeyholeSquare,
  MessageTextSquare01,
  Paperclip,
  Pencil01,
  Plus,
  Settings01,
  Stars01,
} from "@untitledui/icons";
import { Button, Card, Input, Label, Textarea, Toaster, useToastManager } from "@bebopdev/admin";
import { app } from "../bebop-generated-schema.js";
import type { createBebopClient } from "../bebop-generated-client.js";
import { AuthDialog, type AuthIntent } from "./AuthDialog.tsx";

type Client = ReturnType<typeof createBebopClient>;

type UserOption = { id: string; name: string };
type WorkspaceForm = { name: string; slug: string };
type ChannelForm = { name: string; visibility: "public" | "private" };
type PlaygroundWidgetProps = {
  mode: "preview";
  notice?: string;
} | {
  mode: "live";
  client: Client;
  currentUserId: string;
  currentUserName: string;
  currentUserEmail: string;
  currentUserImage: string;
  authors: readonly UserOption[];
  onLogout: () => void | Promise<void>;
};

const dateTimeFormatter = new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" });
const demoChannels = [
  { id: "general", name: "general", locked: false },
  { id: "design", name: "design", locked: false },
  { id: "launch", name: "launch-plan", locked: true },
] as const;
const demoMessages: Record<string, { author: string; initials: string; time: string; content: string }[]> = {
  general: [
    { author: "Maya Chen", initials: "MC", time: "9:18 AM", content: "Welcome to the demo. Pick a channel and try the conversation layout." },
    { author: "Jordan Lee", initials: "JL", time: "9:24 AM", content: "Messages are entries, grouped into a stream that belongs to a channel." },
    { author: "You", initials: "Y", time: "9:32 AM", content: "This sample workspace is ready to explore." },
  ],
  design: [
    { author: "Jordan Lee", initials: "JL", time: "10:02 AM", content: "The new home page should make the product feel approachable and hands-on." },
    { author: "Maya Chen", initials: "MC", time: "10:16 AM", content: "I like the framed app preview. Let's keep the product identity in the details." },
  ],
  launch: [
    { author: "Maya Chen", initials: "MC", time: "11:04 AM", content: "This private channel is a preview. Sign in to create and manage real channel access." },
  ],
};
const demoWorkspaceMembers = [
  { id: "maya", name: "Maya Chen", role: "admin" },
  { id: "jordan", name: "Jordan Lee", role: "member" },
  { id: "zoe", name: "Zoe Maxwell", role: "member" },
];
const demoChannelMembers = demoWorkspaceMembers.slice(0, 2);

function workspaceInitial(name?: string): string {
  return name?.trim().slice(0, 1).toUpperCase() || "B";
}

function userInitials(name?: string): string {
  const parts = name?.trim().split(/\s+/).filter(Boolean) ?? [];
  return parts.slice(0, 2).map((part) => part.slice(0, 1).toUpperCase()).join("") || "U";
}

function Avatar({ name, image, className = "", tone = "color" }: { name: string; image?: string; className?: string; tone?: "color" | "white" }) {
  const [imageFailed, setImageFailed] = useState(false);
  useEffect(() => setImageFailed(false), [image]);
  const toneClass = tone === "white" ? "bg-white text-black" : "bg-secondary text-muted-foreground";
  return <span className={`grid shrink-0 place-items-center overflow-hidden rounded-none font-semibold ${toneClass} ${className}`} aria-hidden="true">{image && !imageFailed ? <img className="size-full object-cover" src={image} alt="" onError={() => setImageFailed(true)} /> : userInitials(name)}</span>;
}

type RosterMember = { id: string; name: string; role: string };

function MemberRoster({ members, currentUserId, rolePrefix }: { members: readonly RosterMember[]; currentUserId?: string; rolePrefix: string }) {
  if (!members.length) return <p className="py-5 text-xs text-muted-foreground">No members to show.</p>;
  return <ul className="divide-y divide-border">{members.map((member) => <li className="flex min-w-0 items-center gap-3 py-3" key={member.id}>
    <Avatar name={member.name} className="size-9 text-[10px]" />
    <span className="min-w-0 flex-1"><span className="block truncate text-xs font-medium text-foreground">{member.name}{member.id === currentUserId && <span className="ml-1.5 font-normal text-muted-foreground">you</span>}</span><span className="mt-0.5 block text-[10px] capitalize text-muted-foreground">{rolePrefix} {member.role}</span></span>
  </li>)}</ul>;
}

type ChannelView = "messages" | "members";

function ChannelTabs({ value, onChange, idPrefix, memberCount }: {
  value: ChannelView;
  onChange: (view: ChannelView) => void;
  idPrefix: string;
  memberCount: number;
}) {
  function handleTabKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
    event.preventDefault();
    const nextView = value === "messages" ? "members" : "messages";
    onChange(nextView);
    document.getElementById(`${idPrefix}-${nextView}-tab`)?.focus();
  }

  return <div className="flex h-11 shrink-0 items-end gap-5 border-b border-border px-6" role="tablist" aria-label="Channel views">
    <button className={`h-10 border-b-2 px-0.5 text-xs font-medium transition-colors ${value === "messages" ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`} type="button" id={`${idPrefix}-messages-tab`} role="tab" tabIndex={value === "messages" ? 0 : -1} aria-selected={value === "messages"} aria-controls={`${idPrefix}-messages-panel`} onKeyDown={handleTabKeyDown} onClick={() => onChange("messages")}>Messages</button>
    <button className={`flex h-10 items-center gap-1.5 border-b-2 px-0.5 text-xs font-medium transition-colors ${value === "members" ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`} type="button" id={`${idPrefix}-members-tab`} role="tab" tabIndex={value === "members" ? 0 : -1} aria-selected={value === "members"} aria-controls={`${idPrefix}-members-panel`} onKeyDown={handleTabKeyDown} onClick={() => onChange("members")}>Members<span className="rounded-none bg-secondary px-1.5 py-0.5 text-[9px] text-muted-foreground">{memberCount}</span></button>
  </div>;
}

function MessageComposer({
  value,
  onChange,
  onSubmit,
  placeholder,
  ariaLabel,
  submitLabel,
}: {
  value: string;
  onChange: (value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  placeholder: string;
  ariaLabel: string;
  submitLabel: string;
}) {
  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      event.currentTarget.form?.requestSubmit();
    }
  }

  return <form className="mx-4 mb-4 mt-auto flex min-h-[62px] items-center gap-2 rounded-none border border-border bg-card px-4 py-1 transition-colors focus-within:border-input" onSubmit={onSubmit}>
    <Textarea
      className="min-h-10 max-h-32 min-w-0 flex-1 resize-none border-0 px-1 py-3 text-sm leading-5 shadow-none placeholder:text-muted-foreground focus-visible:border-transparent focus-visible:ring-0"
      aria-label={ariaLabel}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      onKeyDown={handleKeyDown}
      placeholder={placeholder}
      rows={1}
    />
    <div className="flex shrink-0 items-center gap-1 text-muted-foreground">
      <Button variant="ghost" size="icon-xs" className="size-8 rounded-none text-muted-foreground normal-case tracking-normal hover:bg-secondary hover:text-muted-foreground" type="button" disabled title="Attachments are not available yet" aria-label="Add attachment">
        <Paperclip className="size-4" aria-hidden="true" />
      </Button>
      <Button variant="ghost" size="icon-xs" className="size-8 rounded-none text-muted-foreground normal-case tracking-normal hover:bg-secondary hover:text-muted-foreground" type="button" disabled title="Emoji picker is not available yet" aria-label="Choose emoji">
        <FaceSmile className="size-4" aria-hidden="true" />
      </Button>
      <span className="mx-1 h-6 border-l border-border" aria-hidden="true" />
      <Button size="icon-xs" className="size-8 rounded-none bg-primary text-primary-foreground normal-case tracking-normal hover:bg-primary/80 disabled:bg-secondary disabled:text-muted-foreground" type="submit" disabled={!value.trim()} aria-label={submitLabel} title={submitLabel}>
        <ArrowUp className="size-4" aria-hidden="true" />
      </Button>
    </div>
  </form>;
}

function JoinChannelPrompt({ channelName, onJoin, isJoining = false }: {
  channelName: string;
  onJoin: () => void;
  isJoining?: boolean;
}) {
  return <div className="mx-4 mb-4 mt-auto flex shrink-0 flex-wrap items-center justify-between gap-3 rounded-none border border-border bg-muted px-4 py-3">
    <div className="min-w-0"><p className="text-xs font-semibold text-foreground">You’re viewing #{channelName}</p><p className="mt-1 text-xs text-muted-foreground">Join this channel to send messages and participate.</p></div>
    <Button size="sm" className="shrink-0 rounded-none bg-primary normal-case tracking-normal text-primary-foreground hover:bg-primary/80" type="button" onClick={onJoin} disabled={isJoining}>{isJoining ? "Joining…" : "Join channel"}</Button>
  </div>;
}

function slugify(value: string): string {
  return value.trim().toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

export function PlaygroundWidget(props: PlaygroundWidgetProps) {
  return <Toaster>{props.mode === "preview" ? <PreviewWidget notice={props.notice} /> : <LivePlaygroundWidget {...props} />}</Toaster>;
}

function LivePlaygroundWidget(props: Extract<PlaygroundWidgetProps, { mode: "live" }>) {
  const { client, currentUserId, currentUserName, currentUserEmail } = props;
  const workspaceMenuRef = useRef<HTMLDetailsElement>(null);
  const accountMenuRef = useRef<HTMLDetailsElement>(null);
  const [activeTab, setActiveTab] = useState<"messages" | "settings">("messages");
  const [activeChannelView, setActiveChannelView] = useState<ChannelView>("messages");
  const [activeWorkspaceId, setActiveWorkspaceId] = useState("");
  const [awaitingWorkspaceId, setAwaitingWorkspaceId] = useState("");
  const [activeChannelId, setActiveChannelId] = useState("");
  const [workspaceDialog, setWorkspaceDialog] = useState<"create" | "rename" | null>(null);
  const [showChannelForm, setShowChannelForm] = useState(false);
  const [joiningChannelId, setJoiningChannelId] = useState("");
  const [workspaceName, setWorkspaceName] = useState("");
  const [message, setMessage] = useState("");
  const [inviteUserId, setInviteUserId] = useState("");
  const [workspaceMembers, setWorkspaceMembers] = useState<readonly UserOption[]>([]);
  const [workspaceMembersLoading, setWorkspaceMembersLoading] = useState(false);
  const [workspaceMembersError, setWorkspaceMembersError] = useState("");
  const toast = useToastManager();
  const lastErrorToast = useRef<{ description: string; timestamp: number } | undefined>(undefined);
  const workspaceForm = useForm<WorkspaceForm>({ defaultValues: { name: "", slug: "" } });
  const channelForm = useForm<ChannelForm>({ defaultValues: { name: "", visibility: "public" } });
  const { data: workspaces } = useAll(client.workspaces.query());
  const { data: channels } = useAll(activeWorkspaceId
    ? client.channels.query({ where: { workspaceId: activeWorkspaceId }, orderBy: { field: "name" } })
    : undefined);
  const { data: workspaceMemberships } = useAll(activeWorkspaceId
    ? client.workspaceMemberships.query({ where: { workspaceId: activeWorkspaceId, status: "active" } })
    : undefined);
  const workspaceMembershipIdsKey = workspaceMemberships === undefined
    ? undefined
    : workspaceMemberships.map((membership) => membership.userId).sort().join("\u0000");

  useEffect(() => {
    const closeMenusOutside = (event: PointerEvent) => {
      if (!(event.target instanceof Node)) return;
      for (const menuRef of [workspaceMenuRef, accountMenuRef]) {
        if (menuRef.current?.open && !menuRef.current.contains(event.target)) {
          menuRef.current.open = false;
        }
      }
    };

    document.addEventListener("pointerdown", closeMenusOutside);
    return () => document.removeEventListener("pointerdown", closeMenusOutside);
  }, []);

  useEffect(() => {
    if (!workspaceDialog) return;
    const closeOnEscape = (event: WindowEventMap["keydown"]) => {
      if (event.key === "Escape") setWorkspaceDialog(null);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [workspaceDialog]);

  const orderedChannels = useMemo(() => [...(channels ?? [])].sort((a, b) => a.name.localeCompare(b.name)), [channels]);
  const activeWorkspace = (workspaces ?? []).find((workspace) => workspace.id === activeWorkspaceId);
  const currentWorkspaceMembership = (workspaceMemberships ?? []).find((membership) => membership.userId === currentUserId);
  const canRenameWorkspace = currentWorkspaceMembership?.role === "admin";
  const activeChannel = orderedChannels.find((channel) => channel.id === activeChannelId);
  const { data: entries } = useAll(activeChannel?.streamId
    ? client.entries.where({ streamId: activeChannel.streamId })
      .select("*", "$createdAt")
      .orderBy("$createdAt", "asc")
      .include({ author: app.better_auth_user.select("id", "name") })
    : undefined);
  const { data: streamMemberships } = useAll(activeChannel?.streamId
    ? client.streamMemberships.query({ where: { streamId: activeChannel.streamId } })
    : undefined);

  const memberNames = useMemo(() => {
    const names = new Map<string, string>();
    for (const author of props.authors) names.set(author.id, author.name);
    for (const member of workspaceMembers) names.set(member.id, member.name);
    if (currentUserId) names.set(currentUserId, currentUserName || "You");
    return names;
  }, [currentUserId, currentUserName, props, workspaceMembers]);
  const currentStreamRole = (streamMemberships ?? []).find((membership) => membership.userId === currentUserId)?.role;
  const isCurrentChannelMember = (streamMemberships ?? []).some((membership) => membership.userId === currentUserId);
  const canManageChannel = currentStreamRole === "admin";
  const currentChannelMemberIds = new Set((streamMemberships ?? []).map((membership) => membership.userId));
  const channelMembers = useMemo(() => (streamMemberships ?? []).map((membership) => ({
    id: membership.userId,
    name: memberNames.get(membership.userId) ?? "Workspace member",
    role: membership.role,
  })).sort((a, b) => a.name.localeCompare(b.name)), [memberNames, streamMemberships]);
  const workspaceRoster = useMemo(() => workspaceMembers.map((member) => ({
    ...member,
    role: workspaceMemberships?.find((membership) => membership.userId === member.id)?.role === "admin" ? "admin" : "member",
  })).sort((a, b) => a.name.localeCompare(b.name)), [workspaceMembers, workspaceMemberships]);
  const inviteOptions = workspaceMembers.filter((member) => !currentChannelMemberIds.has(member.id));

  function notifyError(title: string, error: unknown, fallback: string) {
    const description = error instanceof Error ? error.message : typeof error === "string" ? error : fallback;
    const previous = lastErrorToast.current;
    if (previous?.description === description && Date.now() - previous.timestamp < 1500) return;
    lastErrorToast.current = { description, timestamp: Date.now() };
    toast.add({ type: "error", title, description });
  }

  useEffect(() => {
    if (!workspaces) return;
    if (awaitingWorkspaceId) {
      if (workspaces.some((workspace) => workspace.id === awaitingWorkspaceId)) setAwaitingWorkspaceId("");
      return;
    }
    if (!workspaces.some((workspace) => workspace.id === activeWorkspaceId)) {
      setActiveWorkspaceId(workspaces[0]?.id ?? "");
      setActiveChannelId("");
    }
  }, [activeWorkspaceId, awaitingWorkspaceId, workspaces]);

  useEffect(() => {
    if (!orderedChannels.length) {
      setActiveChannelId("");
      setActiveChannelView("messages");
      return;
    }
    if (!orderedChannels.some((channel) => channel.id === activeChannelId)) {
      setActiveChannelId(orderedChannels[0].id);
      setActiveChannelView("messages");
    }
  }, [activeChannelId, orderedChannels]);

  useEffect(() => {
    setWorkspaceName(activeWorkspace?.name ?? "");
  }, [activeWorkspace?.id, activeWorkspace?.name]);

  useEffect(() => {
    if (!activeWorkspaceId) {
      setWorkspaceMembersLoading(false);
      return;
    }
    if (workspaceMembershipIdsKey === undefined) {
      setWorkspaceMembersLoading(true);
      return;
    }
    const controller = new AbortController();
    setWorkspaceMembersLoading(true);
    setWorkspaceMembersError("");
    void fetch(`/api/bebop/workspaces/${encodeURIComponent(activeWorkspaceId)}/members`, {
      credentials: "same-origin",
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error(`Workspace member lookup failed (${response.status}).`);
        return response.json() as Promise<UserOption[]>;
      })
      .then((members) => { setWorkspaceMembers(members); setWorkspaceMembersLoading(false); })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) {
          console.error("Could not load workspace members:", error);
          setWorkspaceMembersLoading(false);
          setWorkspaceMembersError("Could not load workspace members.");
        }
      });
    return () => controller.abort();
  }, [activeWorkspaceId, client, workspaceMembershipIdsKey]);

  useEffect(() => {
    setWorkspaceMembers([]);
    setWorkspaceMembersError("");
  }, [activeWorkspaceId]);

  useEffect(() => {
    if (!client) return;
    return client.onMutationError((event) => {
      notifyError(
        event.code === "permission_denied" ? "Change not saved" : "Could not sync change",
        event.code === "permission_denied"
          ? "This account does not have permission to make that change."
          : "A recent change could not sync. It may be reverted when sync finishes.",
        "A recent change could not sync.",
      );
    });
  }, [client, toast]);

  async function createWorkspace(values: WorkspaceForm) {
    if (!client) return;
    const name = values.name.trim();
    const slug = slugify(values.slug || name);
    if (!slug) {
      workspaceForm.setError("slug", { message: "Enter a valid workspace slug." });
      return;
    }
    try {
      // The workspace command creates its initial active admin membership atomically.
      const created = await client.workspaces.create({ name, slug });
      setActiveWorkspaceId(created.doc.id);
      setAwaitingWorkspaceId(created.doc.id);
      setActiveChannelId("");
      setActiveChannelView("messages");
      workspaceForm.reset({ name: "", slug: "" });
      setWorkspaceDialog(null);
    } catch (error) {
      notifyError("Could not create workspace", error, "Could not create workspace.");
    }
  }

  async function renameWorkspace(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!client || !activeWorkspaceId || !workspaceName.trim()) return;
    try {
      const result = await client.workspaces.update(activeWorkspaceId, { name: workspaceName.trim() });
      await result.waitForGlobal();
      setWorkspaceDialog(null);
    } catch (error) {
      notifyError("Could not rename workspace", error, "Could not rename workspace.");
    }
  }

  async function createChannel(values: ChannelForm) {
    if (!client || !activeWorkspaceId || !currentUserId) {
      notifyError("Could not create channel", "Sign in and choose a workspace before creating a channel.", "Could not create channel.");
      return;
    }
    try {
      const created = await client.channels.create({
        name: values.name.trim().replace(/^#+/, ""),
        workspaceId: activeWorkspaceId,
        authorId: currentUserId,
        visibility: values.visibility,
      });
      setActiveChannelId(created.doc.id);
      setActiveChannelView("messages");
      channelForm.reset({ name: "", visibility: "public" });
      setShowChannelForm(false);
    } catch (error) {
      notifyError("Could not create channel", error, "Could not create channel.");
    }
  }

  async function sendMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!client || !activeChannel?.streamId || !currentUserId || !message.trim()) return;
    try {
      const created = await client.entries.create({
        streamId: activeChannel.streamId,
        type: "message",
        content: message.trim(),
        authorId: currentUserId,
      });
      await created.waitForGlobal();
      setMessage("");
    } catch (error) {
      notifyError("Could not send message", error, "Could not send message.");
    }
  }

  async function joinChannel() {
    if (!client || !currentUserId || !activeChannel?.streamId || joiningChannelId) return;
    setJoiningChannelId(activeChannel.id);
    try {
      const membership = await client.streamMemberships.create({
        workspaceId: activeChannel.workspaceId,
        streamId: activeChannel.streamId,
        userId: currentUserId,
        role: "member",
      });
      await membership.waitForGlobal();
    } catch (error) {
      notifyError("Could not join channel", error, "Could not join channel.");
    } finally {
      setJoiningChannelId("");
    }
  }

  async function addChannelMember(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!client || !activeChannel?.streamId || !inviteUserId) return;
    try {
      const membership = await client.streamMemberships.create({
        workspaceId: activeChannel.workspaceId,
        streamId: activeChannel.streamId,
        userId: inviteUserId,
        role: "member",
      });
      await membership.waitForGlobal();
      setInviteUserId("");
    } catch (error) {
      notifyError("Could not add channel member", error, "Could not add channel member.");
    }
  }

  return (
    <>
    <Card className="mx-auto w-full max-w-[900px] overflow-hidden rounded-none border border-border py-0 shadow-none ring-0" role="region" aria-label="Interactive playground">
      <div className="overflow-x-auto">
        <div className="min-w-[760px]">
          <div className="grid min-h-[600px] grid-cols-[68px_224px_minmax(0,1fr)] bg-sidebar">
            <aside className="flex flex-col items-center gap-2 border-r border-border bg-sidebar px-1.5 py-4 text-sidebar-foreground" aria-label="Playground sections">
              <details ref={workspaceMenuRef} className="group relative z-30 mb-3 w-full">
                <summary className="mx-auto flex w-full cursor-pointer list-none flex-col items-center gap-1 rounded-none p-1 hover:bg-sidebar-foreground/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" aria-label={`Switch workspace${activeWorkspace?.name ? `: ${activeWorkspace.name}` : ""}`}>
                  <span className="relative grid size-10 place-items-center rounded-none bg-white text-base font-semibold text-black">{workspaceInitial(activeWorkspace?.name)}</span>
                </summary>
                <div className="absolute left-full top-0 z-50 ml-3 w-72 rounded-none border border-border bg-card p-3 text-foreground">
                  <div className="mb-2 border-b border-border px-2 pb-3"><p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Current workspace</p><p className="mt-1 truncate text-sm font-semibold">{activeWorkspace?.name ?? "Choose a workspace"}</p></div>
                  <div className="grid gap-1">
                    {(workspaces ?? []).map((workspace) => <Button key={workspace.id} variant="ghost" size="sm" className={`h-9 justify-start gap-2 rounded-none px-2 text-left text-xs normal-case tracking-normal hover:bg-accent hover:text-accent-foreground ${workspace.id === activeWorkspaceId ? "bg-accent font-semibold text-accent-foreground" : "text-muted-foreground"}`} type="button" onClick={(event) => { setActiveWorkspaceId(workspace.id); setActiveChannelId(""); setActiveChannelView("messages"); event.currentTarget.closest("details")?.removeAttribute("open"); }}><span className="grid size-6 shrink-0 place-items-center rounded-none bg-white text-[10px] font-bold text-black">{workspaceInitial(workspace.name)}</span><span className="truncate">{workspace.name}</span>{workspace.id === activeWorkspaceId && <Check className="ml-auto size-4 text-primary" aria-hidden="true" />}</Button>)}
                    {!workspaces?.length && <p className="px-2 py-2 text-xs leading-5 text-muted-foreground">Create a workspace to begin.</p>}
                  </div>
                  <div className="mt-2 grid gap-1 border-t border-border pt-2">
                    <Button variant="ghost" size="sm" className="h-8 justify-start gap-2 rounded-none px-2 text-xs normal-case tracking-normal text-muted-foreground hover:bg-accent hover:text-accent-foreground" type="button" onClick={(event) => { setWorkspaceDialog("create"); workspaceForm.reset({ name: "", slug: "" }); event.currentTarget.closest("details")?.removeAttribute("open"); }}><Plus className="size-4" aria-hidden="true" />Add workspace</Button>
                    {activeWorkspaceId && canRenameWorkspace && <Button variant="ghost" size="sm" className="h-8 justify-start gap-2 rounded-none px-2 text-xs normal-case tracking-normal text-muted-foreground hover:bg-accent hover:text-accent-foreground" type="button" onClick={(event) => { setWorkspaceName(activeWorkspace?.name ?? ""); setWorkspaceDialog("rename"); event.currentTarget.closest("details")?.removeAttribute("open"); }}><Pencil01 className="size-3.5" aria-hidden="true" />Rename workspace</Button>}
                    {activeWorkspaceId && <Button variant="ghost" size="sm" className="h-8 justify-start gap-2 rounded-none px-2 text-xs normal-case tracking-normal text-muted-foreground hover:bg-accent hover:text-accent-foreground" type="button" onClick={(event) => { setActiveTab("settings"); event.currentTarget.closest("details")?.removeAttribute("open"); }}><Settings01 className="size-3.5" aria-hidden="true" />Workspace settings</Button>}
                  </div>
                </div>
              </details>
              <Button variant="ghost" size="sm" className="group flex h-[58px] w-full flex-col gap-1 rounded-none bg-transparent p-1 text-sidebar-foreground normal-case tracking-normal hover:bg-transparent" type="button" onClick={() => setActiveTab("messages")} aria-pressed={activeTab === "messages"} aria-label="Channels"><span className={`grid size-8 place-items-center rounded-none transition-colors ${activeTab === "messages" ? "bg-accent text-accent-foreground" : "bg-transparent text-sidebar-foreground/60 group-hover:bg-sidebar-foreground/10 group-hover:text-sidebar-foreground"}`}><MessageTextSquare01 className="size-5" aria-hidden="true" /></span><span className={`text-[10px] font-semibold ${activeTab === "messages" ? "text-sidebar-foreground" : "text-sidebar-foreground/60 group-hover:text-sidebar-foreground"}`}>Channels</span></Button>
              <div className="flex-1" />
              <details ref={accountMenuRef} className="group relative z-30">
                <summary className="cursor-pointer list-none rounded-none p-0.5 hover:bg-sidebar-foreground/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" aria-label="Open your account menu">
                  <Avatar name={currentUserName || currentUserEmail || "You"} image={props.currentUserImage} tone="white" className="size-10 text-base" />
                </summary>
                <div className="absolute bottom-0 left-full z-50 ml-3 w-64 rounded-none border border-border bg-card p-4 text-foreground">
                  <div className="flex items-center gap-3"><Avatar name={currentUserName || currentUserEmail || "You"} image={props.currentUserImage} tone="white" className="size-10 text-base" /><div className="min-w-0"><p className="truncate text-sm font-semibold">{currentUserName || "Your account"}</p><p className="truncate text-xs text-muted-foreground">{currentUserEmail || "Signed in"}</p></div></div>
                  <div className="mt-3 grid gap-1 border-t border-border pt-3">
                    <p className="px-2 text-[10px] text-muted-foreground">Account</p>
                    <Button variant="ghost" size="sm" className="h-8 justify-start rounded-none px-2 text-xs normal-case tracking-normal text-muted-foreground hover:bg-accent hover:text-accent-foreground" type="button" onClick={() => void props.onLogout()}>Sign out</Button>
                  </div>
                </div>
              </details>
            </aside>

            <aside className="min-w-0 rounded-none border-r border-border bg-card p-4 text-foreground">
              {activeTab === "messages" ? (
                <>
                  <div className="mb-3 flex min-h-10 items-center justify-between border-b border-border pb-2 pl-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground"><span>Channels</span><Button variant="ghost" size="icon-xs" className="rounded-none text-muted-foreground normal-case tracking-normal hover:bg-accent hover:text-accent-foreground" type="button" aria-label="Create channel" title="Create channel" onClick={() => setShowChannelForm((value) => !value)}><Plus className="size-4" aria-hidden="true" /></Button></div>
                  {showChannelForm && (
                    <form className="mb-3 grid gap-2 rounded-none border border-border bg-card p-3" onSubmit={channelForm.handleSubmit(createChannel)}>
                      <Label htmlFor="channel-name" className="normal-case tracking-normal">Channel name</Label>
                      <Input className="h-9 rounded-none border border-input px-2 text-xs" id="channel-name" {...channelForm.register("name", { validate: (value) => !!value.trim() || "Enter a channel name." })} placeholder="team-updates" autoFocus />
                      <Label htmlFor="channel-visibility" className="normal-case tracking-normal">Visibility</Label>
                      <select className="h-9 rounded-none border border-input bg-card px-2 text-xs" id="channel-visibility" {...channelForm.register("visibility")}><option value="public">Public</option><option value="private">Private</option></select>
                      <div className="flex justify-end gap-2"><Button variant="ghost" size="sm" className="h-8 normal-case tracking-normal" type="button" onClick={() => setShowChannelForm(false)}>Cancel</Button><Button size="sm" className="h-8 rounded-none bg-primary normal-case tracking-normal text-primary-foreground hover:bg-primary/80" type="submit" disabled={!activeWorkspaceId || channelForm.formState.isSubmitting}>Create</Button></div>
                    </form>
                  )}
                  <div className="grid gap-1">
                    {!orderedChannels.length && <p className="px-2 py-2 text-xs leading-5 text-muted-foreground">No channels yet. Create one to start a conversation.</p>}
                    {orderedChannels.map((channel) => <Button key={channel.id} variant="ghost" size="sm" className={`h-9 min-w-0 justify-start gap-2 overflow-hidden rounded-none px-2 text-left text-xs normal-case tracking-normal ${channel.id === activeChannelId ? "bg-accent font-semibold text-accent-foreground" : "text-muted-foreground"}`} type="button" onClick={() => { setActiveChannelId(channel.id); setActiveChannelView("messages"); }} aria-current={channel.id === activeChannelId ? "page" : undefined}>
                      <span className="grid w-4 shrink-0 place-items-center text-muted-foreground" aria-hidden="true">{channel.visibility === "private" ? <LockKeyholeSquare className="size-3.5" /> : <Hash01 className="size-4" />}</span><span className="truncate">{channel.name}</span>
                    </Button>)}
                  </div>
                </>
              ) : (
                <div className="mt-7"><span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Workspace settings</span><p className="mt-2 text-xs leading-5 text-muted-foreground">Manage people in {activeWorkspace?.name ?? "your workspace"}.</p></div>
              )}
            </aside>

            <section className="flex min-w-0 min-h-[600px] flex-col overflow-hidden rounded-none bg-card text-foreground" aria-label={activeTab === "messages" ? "Channels" : "Workspace settings"}>
              {activeTab === "messages" ? (
                activeChannel ? (
                  <>
                    <header className="flex min-h-[68px] items-center justify-between gap-4 border-b border-border px-6 py-3">
                      <div className="min-w-0"><h2 className="flex items-baseline gap-2 text-base font-semibold"><span className="text-muted-foreground">{activeChannel.visibility === "private" ? <LockKeyholeSquare className="size-4" aria-hidden="true" /> : <Hash01 className="size-4" aria-hidden="true" />}</span>{activeChannel.name}</h2></div>
                    </header>
                    <ChannelTabs value={activeChannelView} onChange={setActiveChannelView} idPrefix="live-channel" memberCount={channelMembers.length} />
                    {activeChannelView === "messages" ? <>
                    <div className="max-h-[440px] min-h-[250px] flex-1 overflow-y-auto px-6 py-5" id="live-channel-messages-panel" role="tabpanel" aria-labelledby="live-channel-messages-tab" aria-live="polite">
                      {!entries?.length ? <div className="flex h-full min-h-64 flex-col items-center justify-center px-6 py-10 text-center"><Stars01 className="size-6 text-primary" aria-hidden="true" /><h3 className="mt-3 text-lg font-semibold">{isCurrentChannelMember ? "Start the conversation" : "No messages yet"}</h3><p className="mt-1 max-w-xs text-sm text-muted-foreground">{isCurrentChannelMember ? `Send the first message in #${activeChannel.name}.` : `There are no messages in #${activeChannel.name} yet.`}</p></div> : (entries ?? []).map((entry) => <article className="mb-6 grid grid-cols-[40px_minmax(0,1fr)] gap-2" key={entry.id}>
                        <div className="size-10 rounded-none bg-secondary" aria-hidden="true" />
                        <div className="min-w-0"><header className="flex flex-wrap items-baseline gap-x-2 gap-y-1"><strong className="text-sm">{entry.author?.name ?? memberNames.get(entry.authorId) ?? "Workspace member"}</strong><time className="text-xs text-muted-foreground">{entry.$createdAt ? dateTimeFormatter.format(entry.$createdAt) : "Just now"}</time></header><p className="mt-0.5 whitespace-pre-wrap break-words text-sm leading-5 text-muted-foreground">{entry.content}</p></div>
                      </article>)}
                    </div>
                    {streamMemberships === undefined ? <div className="mx-4 mb-4 mt-auto rounded-none border border-border px-4 py-4 text-xs text-muted-foreground" role="status">Checking channel membership…</div> : isCurrentChannelMember ? <MessageComposer value={message} onChange={setMessage} onSubmit={sendMessage} placeholder={`Message #${activeChannel.name}`} ariaLabel={`Message #${activeChannel.name}`} submitLabel="Send message" /> : <JoinChannelPrompt channelName={activeChannel.name} onJoin={() => void joinChannel()} isJoining={joiningChannelId === activeChannel.id} />}
                    </> : <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5" id="live-channel-members-panel" role="tabpanel" aria-labelledby="live-channel-members-tab">
                      <div className="mx-auto max-w-3xl">
                        <div className="flex items-start justify-between gap-4 border-b border-border pb-4"><div><h3 className="text-sm font-semibold">Channel members</h3><p className="mt-1 text-xs text-muted-foreground">People who belong to #{activeChannel.name}.</p></div><span className="rounded-none bg-secondary px-2 py-1 text-[10px] text-muted-foreground">{channelMembers.length}</span></div>
                        {channelMembers.length ? <MemberRoster members={channelMembers} currentUserId={currentUserId} rolePrefix="Channel" /> : <p className="py-5 text-xs text-muted-foreground">No channel members found.</p>}
                        {canManageChannel && <section className="mt-6 border-t border-border pt-5"><h3 className="text-sm font-semibold">Channel access</h3><p className="mt-1 text-xs leading-5 text-muted-foreground">Manage who belongs to #{activeChannel.name}.</p>
                          {inviteOptions.length ? <form className="grid gap-2 border-t border-border pt-3" onSubmit={addChannelMember}>
                            <Label htmlFor="invite-channel-member" className="normal-case tracking-normal">Add a workspace member</Label>
                            <select className="h-9 min-w-0 rounded-none border border-input bg-card px-2 text-xs" id="invite-channel-member" value={inviteUserId} onChange={(event) => setInviteUserId(event.target.value)}>
                              <option value="">Choose a member</option>
                              {inviteOptions.map((member) => <option key={member.id} value={member.id}>{member.name}</option>)}
                            </select>
                            <Button size="sm" className="rounded-none bg-primary normal-case tracking-normal text-primary-foreground hover:bg-primary/80" type="submit" disabled={!inviteUserId}>Add member</Button>
                          </form> : <p className="mt-3 text-xs leading-5 text-muted-foreground">All available workspace members are already here.</p>}
                        </section>}
                      </div>
                    </div>}
                  </>
                ) : (
                  <div className="flex flex-1 flex-col items-center justify-center px-8 py-10 text-center"><Stars01 className="size-6 text-primary" aria-hidden="true" /><h3 className="mt-3 text-lg font-semibold">{activeWorkspaceId ? "Choose a channel" : "Create your first workspace"}</h3><p className="mt-1 max-w-xs text-sm leading-6 text-muted-foreground">{activeWorkspaceId ? "Pick a channel or create one to start chatting." : "Your workspace is where channels and messages live."}</p>
                    {!activeWorkspaceId && <p className="mt-4 text-xs text-muted-foreground">Use the workspace menu in the left rail to add a workspace.</p>}
                  </div>
                )
              ) : (
                <div className="min-h-0 flex-1 overflow-y-auto p-6">
                  <div className="mx-auto max-w-4xl">
                    <header className="border-b border-border pb-5"><p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">{activeWorkspace?.name ?? "Workspace"} / Settings01</p><h2 className="mt-1 text-2xl font-semibold tracking-tight">Workspace settings</h2></header>
                    <section className="mt-6 max-w-2xl overflow-hidden rounded-none border border-border bg-card">
                      <header className="flex items-start justify-between gap-4 border-b border-border px-4 py-3"><div><h3 className="text-sm font-semibold">Members</h3><p className="mt-1 text-xs text-muted-foreground">People who belong to {activeWorkspace?.name ?? "this workspace"}.</p></div><span className="rounded-none bg-secondary px-2 py-1 text-[10px] text-muted-foreground">{workspaceRoster.length}</span></header>
                      <div className="px-4">{workspaceMembersLoading ? <p className="py-5 text-xs text-muted-foreground">Loading members…</p> : workspaceMembersError ? <p className="py-5 text-xs text-destructive" role="alert">{workspaceMembersError}</p> : <MemberRoster members={workspaceRoster} currentUserId={currentUserId} rolePrefix="Workspace" />}</div>
                    </section>
                  </div>
                </div>
              )}
            </section>
          </div>
        </div>
      </div>
    </Card>
    {workspaceDialog && <div className="bebop-admin fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-foreground/50 p-4 backdrop-blur-sm" onMouseDown={(event) => { if (event.target === event.currentTarget) setWorkspaceDialog(null); }}>
      <Card className="relative w-full max-w-md rounded-none border border-border bg-card text-foreground shadow-2xl" role="dialog" aria-modal="true" aria-labelledby="workspace-dialog-title">
        <div className="px-6">
          <header className="mb-6 flex items-start justify-between gap-4">
            <h2 id="workspace-dialog-title" className="font-heading text-lg font-semibold tracking-wider uppercase">{workspaceDialog === "create" ? "Add workspace" : "Rename workspace"}</h2>
            <Button className="-mr-2 -mt-2 rounded-none text-muted-foreground normal-case tracking-normal hover:bg-secondary hover:text-foreground" variant="ghost" size="icon-sm" type="button" aria-label="Close workspace dialog" onClick={() => setWorkspaceDialog(null)}>×</Button>
          </header>
          {workspaceDialog === "create" ? <form className="grid gap-3" onSubmit={workspaceForm.handleSubmit(createWorkspace)}>
            <Label htmlFor="workspace-name" className="normal-case tracking-normal">Workspace name</Label>
            <Input className="h-10 rounded-none border border-input bg-card px-3 text-sm" id="workspace-name" {...workspaceForm.register("name", { validate: (value) => !!value.trim() || "Enter a workspace name." })} placeholder="Studio North" autoFocus />
            {workspaceForm.formState.errors.name && <p className="text-xs text-destructive" role="alert">{workspaceForm.formState.errors.name.message}</p>}
            <Label htmlFor="workspace-slug" className="normal-case tracking-normal">Slug <span className="font-normal text-muted-foreground">optional</span></Label>
            <Input className="h-10 rounded-none border border-input bg-card px-3 text-sm" id="workspace-slug" {...workspaceForm.register("slug")} placeholder="studio-north" />
            {workspaceForm.formState.errors.slug && <p className="text-xs text-destructive" role="alert">{workspaceForm.formState.errors.slug.message}</p>}
            <div className="mt-3 flex justify-end gap-2">
              <Button variant="ghost" size="sm" className="normal-case tracking-normal" type="button" onClick={() => { workspaceForm.reset({ name: "", slug: "" }); setWorkspaceDialog(null); }}>Cancel</Button>
              <Button size="sm" className="rounded-none bg-primary normal-case tracking-normal text-primary-foreground hover:bg-primary/80" type="submit" disabled={workspaceForm.formState.isSubmitting}>Create</Button>
            </div>
          </form> : <form className="grid gap-3" onSubmit={renameWorkspace}>
            <Label htmlFor="workspace-rename" className="normal-case tracking-normal">Workspace name</Label>
            <Input className="h-10 rounded-none border border-input bg-card px-3 text-sm" id="workspace-rename" value={workspaceName} onChange={(event) => setWorkspaceName(event.target.value)} required autoFocus />
            <div className="mt-3 flex justify-end gap-2">
              <Button variant="ghost" size="sm" className="normal-case tracking-normal" type="button" onClick={() => { setWorkspaceName(activeWorkspace?.name ?? ""); setWorkspaceDialog(null); }}>Cancel</Button>
              <Button size="sm" className="rounded-none bg-primary normal-case tracking-normal text-primary-foreground hover:bg-primary/80" type="submit">Save</Button>
            </div>
          </form>}
        </div>
      </Card>
    </div>}
    </>
  );
}

function PreviewWidget({ notice }: { notice?: string }) {
  const workspaceMenuRef = useRef<HTMLDetailsElement>(null);
  const accountMenuRef = useRef<HTMLDetailsElement>(null);
  const [authIntent, setAuthIntent] = useState<AuthIntent>();
  const [activeTab, setActiveTab] = useState<"messages" | "settings">("messages");
  const [activeChannelView, setActiveChannelView] = useState<ChannelView>("messages");
  const [activeChannelId, setActiveChannelId] = useState<string>(demoChannels[0].id);
  const channel = demoChannels.find((item) => item.id === activeChannelId) ?? demoChannels[0];
  const requestAuth = (intent: AuthIntent) => setAuthIntent(intent);

  useEffect(() => {
    const closeMenusOutside = (event: PointerEvent) => {
      if (!(event.target instanceof Node)) return;
      for (const menuRef of [workspaceMenuRef, accountMenuRef]) {
        if (menuRef.current?.open && !menuRef.current.contains(event.target)) {
          menuRef.current.open = false;
        }
      }
    };

    document.addEventListener("pointerdown", closeMenusOutside);
    return () => document.removeEventListener("pointerdown", closeMenusOutside);
  }, []);

  return (
    <>
    {notice && <p className="mx-auto mb-3 w-full max-w-[900px] rounded-none border border-border bg-muted px-4 py-3 text-sm text-foreground" role="status">{notice}</p>}
    <Card className="mx-auto w-full max-w-[900px] overflow-hidden rounded-none border border-border py-0 shadow-none ring-0" role="region" aria-label="Playground preview">
      <div className="overflow-x-auto">
        <div className="min-w-[760px]">
          <div className="grid min-h-[600px] grid-cols-[68px_224px_minmax(0,1fr)] bg-sidebar">
            <aside className="flex flex-col items-center gap-2 border-r border-border bg-sidebar px-1.5 py-4 text-sidebar-foreground" aria-label="Playground sections">
              <details ref={workspaceMenuRef} className="group relative z-30 mb-3 w-full">
                <summary className="mx-auto flex w-full cursor-pointer list-none flex-col items-center gap-1 rounded-none p-1 hover:bg-sidebar-foreground/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" aria-label="Switch workspace: Acme Studio">
                  <span className="grid size-10 place-items-center rounded-none bg-white text-base font-semibold text-black">{workspaceInitial("Acme Studio")}</span>
                </summary>
                <div className="absolute left-full top-0 z-50 ml-3 w-64 rounded-none border border-border bg-card p-3 text-foreground">
                  <p className="px-2 pb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Workspace</p>
                  <div className="flex items-center gap-2 rounded-none bg-accent px-2 py-2 text-xs font-semibold text-accent-foreground"><span className="grid size-6 place-items-center rounded-none bg-white text-[10px] text-black">{workspaceInitial("Acme Studio")}</span>Acme Studio<Check className="ml-auto size-4 text-primary" aria-hidden="true" /></div>
                  <Button variant="ghost" size="sm" className="mt-2 h-8 w-full justify-start gap-2 rounded-none px-2 text-xs normal-case tracking-normal text-muted-foreground hover:bg-accent hover:text-accent-foreground" type="button" onClick={() => requestAuth("sign-up")}><Plus className="size-4" aria-hidden="true" />Create or join a workspace</Button>
                  <Button variant="ghost" size="sm" className="mt-1 h-8 w-full justify-start gap-2 rounded-none px-2 text-xs normal-case tracking-normal text-muted-foreground hover:bg-accent hover:text-accent-foreground" type="button" onClick={(event) => { setActiveTab("settings"); event.currentTarget.closest("details")?.removeAttribute("open"); }}><Settings01 className="size-3.5" aria-hidden="true" />Workspace settings</Button>
                </div>
              </details>
              <Button variant="ghost" size="sm" className="group flex h-[58px] w-full flex-col gap-1 rounded-none bg-transparent p-1 text-sidebar-foreground normal-case tracking-normal hover:bg-transparent" type="button" onClick={() => setActiveTab("messages")} aria-pressed={activeTab === "messages"} aria-label="Channels"><span className={`grid size-8 place-items-center rounded-none transition-colors ${activeTab === "messages" ? "bg-accent text-accent-foreground" : "bg-transparent text-sidebar-foreground/60 group-hover:bg-sidebar-foreground/10 group-hover:text-sidebar-foreground"}`}><MessageTextSquare01 className="size-5" aria-hidden="true" /></span><span className={`text-[10px] font-semibold ${activeTab === "messages" ? "text-sidebar-foreground" : "text-sidebar-foreground/60 group-hover:text-sidebar-foreground"}`}>Channels</span></Button>
              <div className="flex-1" />
              <details ref={accountMenuRef} className="group relative z-30">
                <summary className="cursor-pointer list-none rounded-none p-0.5 hover:bg-sidebar-foreground/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" aria-label="Open your account menu"><Avatar name="Guest" tone="white" className="size-10 text-base" /></summary>
                <div className="absolute bottom-0 left-full z-50 ml-3 w-64 rounded-none border border-border bg-card p-4 text-foreground">
                  <div className="flex items-center gap-3"><Avatar name="Guest" tone="white" className="size-10 text-base" /><div><p className="text-sm font-semibold">Guest preview</p><p className="text-xs text-muted-foreground">Sign in to your account</p></div></div>
                  <div className="mt-3 grid gap-1 border-t border-border pt-3"><Button variant="ghost" size="sm" className="h-8 justify-start rounded-none px-2 text-xs normal-case tracking-normal text-muted-foreground hover:bg-accent hover:text-accent-foreground" type="button" onClick={() => requestAuth("sign-in")}>Sign in</Button><Button size="sm" className="h-8 justify-start rounded-none bg-primary px-2 text-xs normal-case tracking-normal text-primary-foreground hover:bg-primary/80" type="button" onClick={() => requestAuth("sign-up")}>Create account</Button></div>
                </div>
              </details>
            </aside>
            <aside className="min-w-0 rounded-none border-r border-border bg-card p-4 text-foreground">
              {activeTab === "messages" ? <>
                <div className="mb-3 flex min-h-10 items-center justify-between border-b border-border pb-2 pl-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground"><span>Channels</span><Button variant="ghost" size="icon-xs" className="rounded-none text-muted-foreground normal-case tracking-normal hover:bg-accent hover:text-accent-foreground" type="button" aria-label="Create a channel" onClick={() => requestAuth("sign-up")}><Plus className="size-4" aria-hidden="true" /></Button></div>
                <div className="grid gap-1">{demoChannels.map((item) => <Button key={item.id} variant="ghost" size="sm" className={`h-9 min-w-0 justify-start gap-2 overflow-hidden rounded-none px-2 text-left text-xs normal-case tracking-normal ${item.id === activeChannelId ? "bg-accent font-semibold text-accent-foreground" : "text-muted-foreground"}`} type="button" onClick={() => { setActiveChannelId(item.id); setActiveChannelView("messages"); }} aria-current={item.id === activeChannelId ? "page" : undefined}><span className="grid w-4 shrink-0 place-items-center text-muted-foreground" aria-hidden="true">{item.locked ? <LockKeyholeSquare className="size-3.5" /> : <Hash01 className="size-4" />}</span><span className="truncate">{item.name}</span></Button>)}</div>
              </> : <div className="mt-7"><span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Workspace settings</span><p className="mt-2 text-xs leading-5 text-muted-foreground">Manage people in Acme Studio.</p></div>}
            </aside>
            <section className="flex min-w-0 min-h-[600px] flex-col overflow-hidden rounded-none bg-card text-foreground" aria-label={activeTab === "messages" ? "Channels preview" : "Workspace settings preview"}>
              {activeTab === "messages" ? <>
                <header className="flex min-h-[68px] items-center justify-between gap-4 border-b border-border px-6 py-3"><div><h2 className="flex items-baseline gap-2 text-base font-semibold"><span className="text-muted-foreground">{channel.locked ? <LockKeyholeSquare className="size-4" aria-hidden="true" /> : <Hash01 className="size-4" aria-hidden="true" />}</span>{channel.name}</h2></div><Button variant="outline" size="sm" className="shrink-0 rounded-none normal-case tracking-normal text-accent-foreground" type="button" onClick={() => requestAuth("sign-up")}>Create your workspace</Button></header>
                <ChannelTabs value={activeChannelView} onChange={setActiveChannelView} idPrefix="preview-channel" memberCount={demoChannelMembers.length} />
                {activeChannelView === "messages" ? <>
                  <div className="flex-1 overflow-y-auto px-6 py-5" id="preview-channel-messages-panel" role="tabpanel" aria-labelledby="preview-channel-messages-tab">{demoMessages[channel.id].map((entry, index) => <article className="mb-6 grid grid-cols-[40px_minmax(0,1fr)] gap-2" key={`${channel.id}-${index}`}><div className="size-10 rounded-none bg-secondary" aria-hidden="true" /><div className="min-w-0"><header className="flex flex-wrap items-baseline gap-x-2 gap-y-1"><strong className="text-sm">{entry.author}</strong><time className="text-xs text-muted-foreground">{entry.time}</time></header><p className="mt-0.5 whitespace-pre-wrap break-words text-sm leading-5 text-muted-foreground">{entry.content}</p></div></article>)}</div>
                  <JoinChannelPrompt channelName={channel.name} onJoin={() => requestAuth("sign-up")} />
                </> : <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5" id="preview-channel-members-panel" role="tabpanel" aria-labelledby="preview-channel-members-tab"><div className="mx-auto max-w-3xl"><div className="border-b border-border pb-4"><h3 className="text-sm font-semibold">Channel members</h3><p className="mt-1 text-xs text-muted-foreground">People who belong to #{channel.name}.</p></div><MemberRoster members={demoChannelMembers} rolePrefix="Channel" /><Button variant="outline" size="sm" className="mt-4 gap-1 rounded-none normal-case tracking-normal" type="button" onClick={() => requestAuth("sign-up")}>Invite a member<ArrowUpRight className="size-3.5" aria-hidden="true" /></Button></div></div>}
              </> : <div className="min-h-0 flex-1 overflow-y-auto p-6">
                <div className="mx-auto max-w-4xl"><header className="border-b border-border pb-5"><p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Acme Studio / Settings01</p><h2 className="mt-1 text-2xl font-semibold tracking-tight">Workspace settings</h2></header><section className="mt-6 max-w-2xl overflow-hidden rounded-none border border-border bg-card"><header className="flex items-start justify-between gap-4 border-b border-border px-4 py-3"><div><h3 className="text-sm font-semibold">Members</h3><p className="mt-1 text-xs text-muted-foreground">People who belong to Acme Studio.</p></div><span className="rounded-none bg-secondary px-2 py-1 text-[10px] text-muted-foreground">{demoWorkspaceMembers.length}</span></header><div className="px-4"><MemberRoster members={demoWorkspaceMembers} rolePrefix="Workspace" /></div></section></div>
              </div>}
            </section>
          </div>
        </div>
      </div>
    </Card>
    {authIntent && <AuthDialog intent={authIntent} onClose={() => setAuthIntent(undefined)} />}
    </>
  );
}
