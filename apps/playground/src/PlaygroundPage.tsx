import { useEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { useAll } from "jazz-tools/react";
import { useForm } from "react-hook-form";
import { ArrowUp, ArrowUpRight, Check, Hash, LockKeyhole, MessageSquareText, Paperclip, Pencil, Plus, Search, Settings, Smile, Sparkles } from "lucide-react";
import { Button, Card, Input, Label, Textarea, Toaster, useToastManager } from "@bebopdev/admin";
import type { StreamClient } from "./stream-client.js";
import { AuthDialog, type AuthIntent } from "./AuthDialog.tsx";

type UserOption = { id: string; name: string };
type WorkspaceForm = { name: string; slug: string };
type ChannelForm = { name: string; visibility: "public" | "private" };
type PlaygroundWidgetProps = {
  mode: "preview";
  notice?: string;
} | {
  mode: "live";
  client: StreamClient;
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
    { author: "Maya Chen", initials: "MC", time: "9:18 AM", content: "Welcome to the Bebop demo. Pick a channel and try the conversation layout." },
    { author: "Jordan Lee", initials: "JL", time: "9:24 AM", content: "Messages are entries, grouped into a stream that belongs to a channel." },
    { author: "You", initials: "Y", time: "9:32 AM", content: "This sample workspace is ready to explore." },
  ],
  design: [
    { author: "Jordan Lee", initials: "JL", time: "10:02 AM", content: "The new home page should make the product feel approachable and hands-on." },
    { author: "Maya Chen", initials: "MC", time: "10:16 AM", content: "I like the framed app preview. Let's keep the Bebop identity in the details." },
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
  const toneClass = tone === "white" ? "bg-white text-[#8d435f]" : "bg-[#d9d9d9] text-slate-700";
  return <span className={`grid shrink-0 place-items-center overflow-hidden rounded-[14px] font-semibold ${toneClass} ${className}`} aria-hidden="true">{image && !imageFailed ? <img className="size-full object-cover" src={image} alt="" onError={() => setImageFailed(true)} /> : userInitials(name)}</span>;
}

type RosterMember = { id: string; name: string; role: string };

function MemberRoster({ members, currentUserId, rolePrefix }: { members: readonly RosterMember[]; currentUserId?: string; rolePrefix: string }) {
  if (!members.length) return <p className="py-5 text-xs text-slate-500">No members to show.</p>;
  return <ul className="divide-y divide-slate-100">{members.map((member) => <li className="flex min-w-0 items-center gap-3 py-3" key={member.id}>
    <Avatar name={member.name} className="size-9 text-[10px]" />
    <span className="min-w-0 flex-1"><span className="block truncate text-xs font-medium text-slate-800">{member.name}{member.id === currentUserId && <span className="ml-1.5 font-normal text-slate-400">you</span>}</span><span className="mt-0.5 block text-[10px] capitalize text-slate-400">{rolePrefix} {member.role}</span></span>
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

  return <div className="flex h-11 shrink-0 items-end gap-5 border-b border-slate-200 px-6" role="tablist" aria-label="Channel views">
    <button className={`h-10 border-b-2 px-0.5 text-xs font-medium transition-colors ${value === "messages" ? "border-[#b45d7e] text-[#99536c]" : "border-transparent text-slate-500 hover:text-slate-800"}`} type="button" id={`${idPrefix}-messages-tab`} role="tab" tabIndex={value === "messages" ? 0 : -1} aria-selected={value === "messages"} aria-controls={`${idPrefix}-messages-panel`} onKeyDown={handleTabKeyDown} onClick={() => onChange("messages")}>Messages</button>
    <button className={`flex h-10 items-center gap-1.5 border-b-2 px-0.5 text-xs font-medium transition-colors ${value === "members" ? "border-[#b45d7e] text-[#99536c]" : "border-transparent text-slate-500 hover:text-slate-800"}`} type="button" id={`${idPrefix}-members-tab`} role="tab" tabIndex={value === "members" ? 0 : -1} aria-selected={value === "members"} aria-controls={`${idPrefix}-members-panel`} onKeyDown={handleTabKeyDown} onClick={() => onChange("members")}>Members<span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[9px] text-slate-500">{memberCount}</span></button>
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

  return <form className="mx-4 mb-4 mt-auto flex min-h-[62px] items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-1 transition-colors focus-within:border-slate-300" onSubmit={onSubmit}>
    <Textarea
      className="min-h-10 max-h-32 min-w-0 flex-1 resize-none border-0 px-1 py-3 text-sm leading-5 shadow-none placeholder:text-slate-400 focus-visible:border-transparent focus-visible:ring-0"
      aria-label={ariaLabel}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      onKeyDown={handleKeyDown}
      placeholder={placeholder}
      rows={1}
    />
    <div className="flex shrink-0 items-center gap-1 text-slate-400">
      <Button variant="ghost" size="icon-xs" className="size-8 rounded-full text-slate-400 normal-case tracking-normal hover:bg-slate-100 hover:text-slate-600" type="button" disabled title="Attachments are not available yet" aria-label="Add attachment">
        <Paperclip className="size-4" aria-hidden="true" />
      </Button>
      <Button variant="ghost" size="icon-xs" className="size-8 rounded-full text-slate-400 normal-case tracking-normal hover:bg-slate-100 hover:text-slate-600" type="button" disabled title="Emoji picker is not available yet" aria-label="Choose emoji">
        <Smile className="size-4" aria-hidden="true" />
      </Button>
      <span className="mx-1 h-6 border-l border-slate-200" aria-hidden="true" />
      <Button size="icon-xs" className="size-8 rounded-full bg-[#b45d7e] text-white normal-case tracking-normal hover:bg-[#9e4b6b] disabled:bg-slate-200 disabled:text-slate-400" type="submit" disabled={!value.trim()} aria-label={submitLabel} title={submitLabel}>
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
  return <div className="mx-4 mb-4 mt-auto flex shrink-0 flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
    <div className="min-w-0"><p className="text-xs font-semibold text-slate-800">You’re viewing #{channelName}</p><p className="mt-1 text-xs text-slate-500">Join this channel to send messages and participate.</p></div>
    <Button size="sm" className="shrink-0 rounded-md bg-[#b45d7e] normal-case tracking-normal text-white hover:bg-[#9e4b6b]" type="button" onClick={onJoin} disabled={isJoining}>{isJoining ? "Joining…" : "Join channel"}</Button>
  </div>;
}

function PlaygroundSearch({ workspaceName, value, onChange }: {
  workspaceName: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return <div className="absolute left-1/2 flex h-7 w-[min(420px,calc(100%_-_140px))] -translate-x-1/2 items-center gap-2 rounded-md bg-[#71334f] px-3 text-white/70 focus-within:bg-[#642c47] focus-within:ring-1 focus-within:ring-white/35">
    <Search className="size-3.5 shrink-0" aria-hidden="true" />
    <input className="min-w-0 flex-1 border-0 bg-transparent p-0 text-[11px] text-white outline-none placeholder:text-white/65 focus:ring-0" type="search" aria-label={`Search ${workspaceName}`} placeholder={`Search ${workspaceName}`} value={value} onChange={(event) => onChange(event.target.value)} />
    {value && <button className="text-[10px] text-white/75 hover:text-white" type="button" onClick={() => onChange("")} aria-label="Clear search">Clear</button>}
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
  const [showWorkspaceForm, setShowWorkspaceForm] = useState(false);
  const [showRenameForm, setShowRenameForm] = useState(false);
  const [showChannelForm, setShowChannelForm] = useState(false);
  const [joiningChannelId, setJoiningChannelId] = useState("");
  const [workspaceName, setWorkspaceName] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
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

  const orderedChannels = useMemo(() => [...(channels ?? [])].sort((a, b) => a.name.localeCompare(b.name)), [channels]);
  const activeWorkspace = (workspaces ?? []).find((workspace) => workspace.id === activeWorkspaceId);
  const currentWorkspaceMembership = (workspaceMemberships ?? []).find((membership) => membership.userId === currentUserId);
  const canRenameWorkspace = currentWorkspaceMembership?.role === "admin";
  const activeChannel = orderedChannels.find((channel) => channel.id === activeChannelId);
  const searchText = searchQuery.trim().toLocaleLowerCase();
  const searchedChannels = orderedChannels.filter((channel) => !searchText || channel.name.toLocaleLowerCase().includes(searchText) || (channel.content ?? "").toLocaleLowerCase().includes(searchText));

  const { data: entries } = useAll(activeChannel?.streamId
    ? client.entries.query({ where: { streamId: activeChannel.streamId }, orderBy: { field: "$createdAt", direction: "asc" }, includeTimestamps: true })
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
    setShowRenameForm(false);
  }, [activeWorkspace?.id, activeWorkspace?.name]);

  useEffect(() => {
    setWorkspaceMembers([]);
    setWorkspaceMembersError("");
    if (!activeWorkspaceId) {
      setWorkspaceMembersLoading(false);
      return;
    }
    const controller = new AbortController();
    setWorkspaceMembersLoading(true);
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
  }, [activeWorkspaceId, client]);

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
      setShowWorkspaceForm(false);
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
      setShowRenameForm(false);
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
    <Card className="mx-auto w-full max-w-[900px] overflow-hidden rounded-xl border-4 border-[#8d435f] py-0 shadow-none ring-0" role="region" aria-label="Interactive Bebop playground">
      <div className="overflow-x-auto">
        <div className="min-w-[760px]">
          <div className="relative flex h-11 items-center bg-[#8d435f] px-4 text-white">
            <div className="flex gap-2" aria-hidden="true"><i className="size-3 rounded-full bg-red-400" /><i className="size-3 rounded-full bg-amber-300" /><i className="size-3 rounded-full bg-green-400" /></div>
            <PlaygroundSearch workspaceName={activeWorkspace?.name ?? "Bebop"} value={searchQuery} onChange={setSearchQuery} />
          </div>
          <div className="grid min-h-[600px] grid-cols-[68px_224px_minmax(0,1fr)] bg-[#8d435f]">
            <aside className="flex flex-col items-center gap-2 bg-[#8d435f] px-1.5 py-4 text-white" aria-label="Playground sections">
              <details ref={workspaceMenuRef} className="group relative z-30 mb-3 w-full">
                <summary className="mx-auto flex w-full cursor-pointer list-none flex-col items-center gap-1 rounded-lg p-1 hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300" aria-label={`Switch workspace${activeWorkspace?.name ? `: ${activeWorkspace.name}` : ""}`}>
                  <span className="relative grid size-10 place-items-center rounded-[14px] bg-white text-base font-semibold text-[#8d435f]">{workspaceInitial(activeWorkspace?.name)}</span>
                </summary>
                <div className="absolute left-full top-0 z-50 ml-3 w-72 rounded-lg border border-slate-200 bg-white p-3 text-slate-800">
                  <div className="mb-2 border-b border-slate-100 px-2 pb-3"><p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Current workspace</p><p className="mt-1 truncate text-sm font-semibold">{activeWorkspace?.name ?? "Choose a workspace"}</p></div>
                  <div className="grid gap-1">
                    {(workspaces ?? []).map((workspace) => <Button key={workspace.id} variant="ghost" size="sm" className={`h-9 justify-start gap-2 rounded-md px-2 text-left text-xs normal-case tracking-normal hover:bg-[#f3e8ee] hover:text-[#91506a] ${workspace.id === activeWorkspaceId ? "bg-[#f3e8ee] font-semibold text-[#91506a]" : "text-slate-600"}`} type="button" onClick={(event) => { setActiveWorkspaceId(workspace.id); setActiveChannelId(""); setActiveChannelView("messages"); event.currentTarget.closest("details")?.removeAttribute("open"); }}><span className="grid size-6 shrink-0 place-items-center rounded-md bg-white text-[10px] font-bold text-[#8d435f]">{workspaceInitial(workspace.name)}</span><span className="truncate">{workspace.name}</span>{workspace.id === activeWorkspaceId && <Check className="ml-auto size-4 text-[#b45d7e]" aria-hidden="true" />}</Button>)}
                    {!workspaces?.length && <p className="px-2 py-2 text-xs leading-5 text-slate-500">Create a workspace to begin.</p>}
                  </div>
                  <div className="mt-2 grid gap-1 border-t border-slate-100 pt-2">
                    <Button variant="ghost" size="sm" className="h-8 justify-start gap-2 rounded-md px-2 text-xs normal-case tracking-normal text-slate-600 hover:bg-[#f3e8ee] hover:text-[#91506a]" type="button" onClick={() => setShowWorkspaceForm((value) => !value)}><Plus className="size-4" aria-hidden="true" />Add workspace</Button>
                    {activeWorkspaceId && canRenameWorkspace && <Button variant="ghost" size="sm" className="h-8 justify-start gap-2 rounded-md px-2 text-xs normal-case tracking-normal text-slate-600 hover:bg-[#f3e8ee] hover:text-[#91506a]" type="button" onClick={() => setShowRenameForm((value) => !value)}><Pencil className="size-3.5" aria-hidden="true" />Rename workspace</Button>}
                    {activeWorkspaceId && <Button variant="ghost" size="sm" className="h-8 justify-start gap-2 rounded-md px-2 text-xs normal-case tracking-normal text-slate-600 hover:bg-[#f3e8ee] hover:text-[#91506a]" type="button" onClick={(event) => { setActiveTab("settings"); event.currentTarget.closest("details")?.removeAttribute("open"); }}><Settings className="size-3.5" aria-hidden="true" />Workspace settings</Button>}
                  </div>
                  {showRenameForm && canRenameWorkspace && <form className="mt-2 grid gap-2 rounded-lg border border-slate-200 bg-slate-50 p-3" onSubmit={renameWorkspace}>
                    <Label htmlFor="workspace-rename" className="normal-case tracking-normal">Workspace name</Label>
                    <Input className="h-9 rounded-md border border-slate-300 bg-white px-2 text-xs" id="workspace-rename" value={workspaceName} onChange={(event) => setWorkspaceName(event.target.value)} required />
                    <div className="flex justify-end gap-2"><Button variant="ghost" size="sm" className="h-8 normal-case tracking-normal text-slate-600 hover:bg-[#f3e8ee] hover:text-[#91506a]" type="button" onClick={() => { setWorkspaceName(activeWorkspace?.name ?? ""); setShowRenameForm(false); }}>Cancel</Button><Button size="sm" className="h-8 rounded-md bg-[#b45d7e] normal-case tracking-normal text-white hover:bg-[#9e4b6b]" type="submit">Save</Button></div>
                  </form>}
                  {showWorkspaceForm && <form className="mt-2 grid gap-2 rounded-lg border border-slate-200 bg-slate-50 p-3" onSubmit={workspaceForm.handleSubmit(createWorkspace)}>
                    <Label htmlFor="workspace-name" className="normal-case tracking-normal">Workspace name</Label>
                    <Input className="h-9 rounded-md border border-slate-300 bg-white px-2 text-xs" id="workspace-name" {...workspaceForm.register("name", { validate: (value) => !!value.trim() || "Enter a workspace name." })} placeholder="Studio North" autoFocus />
                    {workspaceForm.formState.errors.name && <p className="text-xs text-red-700">{workspaceForm.formState.errors.name.message}</p>}
                    <Label htmlFor="workspace-slug" className="normal-case tracking-normal">Slug <span className="font-normal text-slate-400">optional</span></Label>
                    <Input className="h-9 rounded-md border border-slate-300 bg-white px-2 text-xs" id="workspace-slug" {...workspaceForm.register("slug")} placeholder="studio-north" />
                    {workspaceForm.formState.errors.slug && <p className="text-xs text-red-700">{workspaceForm.formState.errors.slug.message}</p>}
                    <div className="flex justify-end gap-2"><Button variant="ghost" size="sm" className="h-8 normal-case tracking-normal text-slate-600 hover:bg-[#f3e8ee] hover:text-[#91506a]" type="button" onClick={() => setShowWorkspaceForm(false)}>Cancel</Button><Button size="sm" className="h-8 rounded-md bg-[#b45d7e] normal-case tracking-normal text-white hover:bg-[#9e4b6b]" type="submit" disabled={workspaceForm.formState.isSubmitting}>Create</Button></div>
                  </form>}
                </div>
              </details>
              <Button variant="ghost" size="sm" className="group flex h-[58px] w-full flex-col gap-1 rounded-lg bg-transparent p-1 text-white normal-case tracking-normal hover:bg-transparent" type="button" onClick={() => setActiveTab("messages")} aria-pressed={activeTab === "messages"} aria-label="Channels"><span className={`grid size-10 place-items-center rounded-lg transition-colors ${activeTab === "messages" ? "bg-[#b45d7e] text-white" : "bg-transparent text-white/60 group-hover:bg-white/10 group-hover:text-white"}`}><MessageSquareText className="size-5" aria-hidden="true" /></span><span className={`text-[10px] font-semibold ${activeTab === "messages" ? "text-white" : "text-white/60 group-hover:text-white"}`}>Channels</span></Button>
              <div className="flex-1" />
              <details ref={accountMenuRef} className="group relative z-30">
                <summary className="cursor-pointer list-none rounded-full p-0.5 hover:bg-white/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300" aria-label="Open your account menu">
                  <Avatar name={currentUserName || currentUserEmail || "You"} image={props.currentUserImage} tone="white" className="size-10 text-base" />
                </summary>
                <div className="absolute bottom-0 left-full z-50 ml-3 w-64 rounded-lg border border-slate-200 bg-white p-4 text-slate-800">
                  <div className="flex items-center gap-3"><Avatar name={currentUserName || currentUserEmail || "You"} image={props.currentUserImage} tone="white" className="size-10 text-base" /><div className="min-w-0"><p className="truncate text-sm font-semibold">{currentUserName || "Your account"}</p><p className="truncate text-xs text-slate-500">{currentUserEmail || "Signed in to Bebop"}</p></div></div>
                  <div className="mt-3 grid gap-1 border-t border-slate-100 pt-3">
                    <p className="px-2 text-[10px] text-slate-400">Bebop account</p>
                    <Button variant="ghost" size="sm" className="h-8 justify-start rounded-md px-2 text-xs normal-case tracking-normal text-slate-700 hover:bg-[#f3e8ee] hover:text-[#91506a]" type="button" onClick={() => void props.onLogout()}>Sign out</Button>
                  </div>
                </div>
              </details>
            </aside>

            <aside className="min-w-0 rounded-l-[14px] border-r border-slate-200 bg-white p-4 text-slate-800">
              {activeTab === "messages" ? (
                <>
                  <div className="mb-3 flex min-h-10 items-center justify-between border-b border-slate-100 pb-2 pl-1 text-[10px] font-semibold uppercase tracking-wider text-slate-500"><span>Channels</span><Button variant="ghost" size="icon-xs" className="rounded-md text-slate-500 normal-case tracking-normal hover:bg-[#f3e8ee] hover:text-[#91506a]" type="button" aria-label="Create channel" title="Create channel" onClick={() => setShowChannelForm((value) => !value)}><Plus className="size-4" aria-hidden="true" /></Button></div>
                  {showChannelForm && (
                    <form className="mb-3 grid gap-2 rounded-lg border border-slate-200 bg-white p-3" onSubmit={channelForm.handleSubmit(createChannel)}>
                      <Label htmlFor="channel-name" className="normal-case tracking-normal">Channel name</Label>
                      <Input className="h-9 rounded-md border border-slate-300 px-2 text-xs" id="channel-name" {...channelForm.register("name", { validate: (value) => !!value.trim() || "Enter a channel name." })} placeholder="team-updates" autoFocus />
                      <Label htmlFor="channel-visibility" className="normal-case tracking-normal">Visibility</Label>
                      <select className="h-9 rounded-md border border-slate-300 bg-white px-2 text-xs" id="channel-visibility" {...channelForm.register("visibility")}><option value="public">Public</option><option value="private">Private</option></select>
                      <div className="flex justify-end gap-2"><Button variant="ghost" size="sm" className="h-8 normal-case tracking-normal" type="button" onClick={() => setShowChannelForm(false)}>Cancel</Button><Button size="sm" className="h-8 rounded-md bg-[#b45d7e] normal-case tracking-normal text-white hover:bg-[#9e4b6b]" type="submit" disabled={!activeWorkspaceId || channelForm.formState.isSubmitting}>Create</Button></div>
                    </form>
                  )}
                  <div className="grid gap-1">
                    {!searchedChannels.length && <p className="px-2 py-2 text-xs leading-5 text-slate-500">{searchText ? `No channels match “${searchQuery}”.` : "No channels yet. Create one to start a conversation."}</p>}
                    {searchedChannels.map((channel) => <Button key={channel.id} variant="ghost" size="sm" className={`h-9 min-w-0 justify-start gap-2 overflow-hidden rounded-md px-2 text-left text-xs normal-case tracking-normal ${channel.id === activeChannelId ? "bg-[#f3e8ee] font-semibold text-[#91506a]" : "text-slate-600"}`} type="button" onClick={() => { setActiveChannelId(channel.id); setActiveChannelView("messages"); }} aria-current={channel.id === activeChannelId ? "page" : undefined}>
                      <span className="grid w-4 shrink-0 place-items-center text-slate-400" aria-hidden="true">{channel.visibility === "private" ? <LockKeyhole className="size-3.5" /> : <Hash className="size-4" />}</span><span className="truncate">{channel.name}</span>
                    </Button>)}
                  </div>
                </>
              ) : (
                <div className="mt-7"><span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Workspace settings</span><p className="mt-2 text-xs leading-5 text-slate-500">Manage people in {activeWorkspace?.name ?? "your workspace"}.</p></div>
              )}
            </aside>

            <section className="flex min-w-0 min-h-[600px] flex-col overflow-hidden rounded-r-[14px] bg-white text-slate-900" aria-label={activeTab === "messages" ? "Channels" : "Workspace settings"}>
              {activeTab === "messages" ? (
                activeChannel ? (
                  <>
                    <header className="flex min-h-[68px] items-center justify-between gap-4 border-b border-slate-200 px-6 py-3">
                      <div className="min-w-0"><h2 className="flex items-baseline gap-2 text-base font-semibold"><span className="text-slate-500">{activeChannel.visibility === "private" ? <LockKeyhole className="size-4" aria-hidden="true" /> : <Hash className="size-4" aria-hidden="true" />}</span>{activeChannel.name}</h2></div>
                      <span className="shrink-0 text-[10px] text-slate-400">{channelMembers.length} members</span>
                    </header>
                    <ChannelTabs value={activeChannelView} onChange={setActiveChannelView} idPrefix="live-channel" memberCount={channelMembers.length} />
                    {activeChannelView === "messages" ? <>
                    <div className="max-h-[440px] min-h-[250px] flex-1 overflow-y-auto px-6 py-5" id="live-channel-messages-panel" role="tabpanel" aria-labelledby="live-channel-messages-tab" aria-live="polite">
                      {!entries?.length ? <div className="flex h-full min-h-64 flex-col items-center justify-center px-6 py-10 text-center"><Sparkles className="size-6 text-[#b45d7e]" aria-hidden="true" /><h3 className="mt-3 text-lg font-semibold">{isCurrentChannelMember ? "Start the conversation" : "No messages yet"}</h3><p className="mt-1 max-w-xs text-sm text-slate-500">{isCurrentChannelMember ? `Send the first message in #${activeChannel.name}.` : `There are no messages in #${activeChannel.name} yet.`}</p></div> : (entries ?? []).map((entry) => <article className="mb-6 grid grid-cols-[40px_minmax(0,1fr)] gap-2" key={entry.id}>
                        <div className="size-10 rounded-[14px] bg-[#d9d9d9]" aria-hidden="true" />
                        <div className="min-w-0"><header className="flex flex-wrap items-baseline gap-x-2 gap-y-1"><strong className="text-sm">{memberNames.get(entry.authorId) ?? "Workspace member"}</strong><time className="text-xs text-slate-400">{entry.$createdAt ? dateTimeFormatter.format(entry.$createdAt) : "Just now"}</time></header><p className="mt-0.5 whitespace-pre-wrap break-words text-sm leading-5 text-slate-700">{entry.content}</p></div>
                      </article>)}
                    </div>
                    {streamMemberships === undefined ? <div className="mx-4 mb-4 mt-auto rounded-xl border border-slate-200 px-4 py-4 text-xs text-slate-500" role="status">Checking channel membership…</div> : isCurrentChannelMember ? <MessageComposer value={message} onChange={setMessage} onSubmit={sendMessage} placeholder={`Message #${activeChannel.name}`} ariaLabel={`Message #${activeChannel.name}`} submitLabel="Send message" /> : <JoinChannelPrompt channelName={activeChannel.name} onJoin={() => void joinChannel()} isJoining={joiningChannelId === activeChannel.id} />}
                    </> : <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5" id="live-channel-members-panel" role="tabpanel" aria-labelledby="live-channel-members-tab">
                      <div className="mx-auto max-w-3xl">
                        <div className="flex items-start justify-between gap-4 border-b border-slate-100 pb-4"><div><h3 className="text-sm font-semibold">Channel members</h3><p className="mt-1 text-xs text-slate-500">People who belong to #{activeChannel.name}.</p></div><span className="rounded-full bg-slate-100 px-2 py-1 text-[10px] text-slate-500">{channelMembers.length}</span></div>
                        {channelMembers.length ? <MemberRoster members={channelMembers} currentUserId={currentUserId} rolePrefix="Channel" /> : <p className="py-5 text-xs text-slate-500">No channel members found.</p>}
                        {canManageChannel && <section className="mt-6 border-t border-slate-200 pt-5"><h3 className="text-sm font-semibold">Channel access</h3><p className="mt-1 text-xs leading-5 text-slate-500">Manage who belongs to #{activeChannel.name}.</p>
                          {inviteOptions.length ? <form className="grid gap-2 border-t border-slate-100 pt-3" onSubmit={addChannelMember}>
                            <Label htmlFor="invite-channel-member" className="normal-case tracking-normal">Add a workspace member</Label>
                            <select className="h-9 min-w-0 rounded-md border border-slate-300 bg-white px-2 text-xs" id="invite-channel-member" value={inviteUserId} onChange={(event) => setInviteUserId(event.target.value)}>
                              <option value="">Choose a member</option>
                              {inviteOptions.map((member) => <option key={member.id} value={member.id}>{member.name}</option>)}
                            </select>
                            <Button size="sm" className="rounded-md bg-[#b45d7e] normal-case tracking-normal text-white hover:bg-[#9e4b6b]" type="submit" disabled={!inviteUserId}>Add member</Button>
                          </form> : <p className="mt-3 text-xs leading-5 text-slate-500">All available workspace members are already here.</p>}
                        </section>}
                      </div>
                    </div>}
                  </>
                ) : (
                  <div className="flex flex-1 flex-col items-center justify-center px-8 py-10 text-center"><Sparkles className="size-6 text-[#b45d7e]" aria-hidden="true" /><h3 className="mt-3 text-lg font-semibold">{activeWorkspaceId ? "Choose a channel" : "Create your first workspace"}</h3><p className="mt-1 max-w-xs text-sm leading-6 text-slate-500">{activeWorkspaceId ? "Pick a channel or create one to start chatting." : "Your workspace is where channels and messages live."}</p>
                    {!activeWorkspaceId && <p className="mt-4 text-xs text-slate-400">Use the Bebop menu in the left rail to add a workspace.</p>}
                  </div>
                )
              ) : (
                <div className="min-h-0 flex-1 overflow-y-auto p-6">
                  <div className="mx-auto max-w-4xl">
                    <header className="border-b border-slate-200 pb-5"><p className="text-[10px] font-medium uppercase tracking-wider text-slate-400">{activeWorkspace?.name ?? "Workspace"} / Settings</p><h2 className="mt-1 text-2xl font-semibold tracking-tight">Workspace settings</h2></header>
                    <section className="mt-6 max-w-2xl overflow-hidden rounded-lg border border-slate-200 bg-white">
                      <header className="flex items-start justify-between gap-4 border-b border-slate-100 px-4 py-3"><div><h3 className="text-sm font-semibold">Members</h3><p className="mt-1 text-xs text-slate-500">People who belong to {activeWorkspace?.name ?? "this workspace"}.</p></div><span className="rounded-full bg-slate-100 px-2 py-1 text-[10px] text-slate-500">{workspaceRoster.length}</span></header>
                      <div className="px-4">{workspaceMembersLoading ? <p className="py-5 text-xs text-slate-500">Loading members…</p> : workspaceMembersError ? <p className="py-5 text-xs text-red-700" role="alert">{workspaceMembersError}</p> : <MemberRoster members={workspaceRoster} currentUserId={currentUserId} rolePrefix="Workspace" />}</div>
                    </section>
                  </div>
                </div>
              )}
            </section>
          </div>
        </div>
      </div>
    </Card>
  );
}

function PreviewWidget({ notice }: { notice?: string }) {
  const workspaceMenuRef = useRef<HTMLDetailsElement>(null);
  const accountMenuRef = useRef<HTMLDetailsElement>(null);
  const [authIntent, setAuthIntent] = useState<AuthIntent>();
  const [activeTab, setActiveTab] = useState<"messages" | "settings">("messages");
  const [activeChannelView, setActiveChannelView] = useState<ChannelView>("messages");
  const [activeChannelId, setActiveChannelId] = useState<string>(demoChannels[0].id);
  const [searchQuery, setSearchQuery] = useState("");
  const searchText = searchQuery.trim().toLocaleLowerCase();
  const searchedDemoChannels = demoChannels.filter((item) => !searchText || item.name.toLocaleLowerCase().includes(searchText));
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
    {notice && <p className="mx-auto mb-3 w-full max-w-[900px] rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900" role="status">{notice}</p>}
    <Card className="mx-auto w-full max-w-[900px] overflow-hidden rounded-xl border-4 border-[#8d435f] py-0 shadow-none ring-0" role="region" aria-label="Bebop playground preview">
      <div className="overflow-x-auto">
        <div className="min-w-[760px]">
          <div className="relative flex h-11 items-center bg-[#8d435f] px-4 text-white">
            <div className="flex gap-2" aria-hidden="true"><i className="size-3 rounded-full bg-red-400" /><i className="size-3 rounded-full bg-amber-300" /><i className="size-3 rounded-full bg-green-400" /></div>
            <PlaygroundSearch workspaceName="Acme Studio" value={searchQuery} onChange={setSearchQuery} />
          </div>
          <div className="grid min-h-[600px] grid-cols-[68px_224px_minmax(0,1fr)] bg-[#8d435f]">
            <aside className="flex flex-col items-center gap-2 bg-[#8d435f] px-1.5 py-4 text-white" aria-label="Playground sections">
              <details ref={workspaceMenuRef} className="group relative z-30 mb-3 w-full">
                <summary className="mx-auto flex w-full cursor-pointer list-none flex-col items-center gap-1 rounded-lg p-1 hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300" aria-label="Switch workspace: Acme Studio">
                  <span className="grid size-10 place-items-center rounded-[14px] bg-white text-base font-semibold text-[#8d435f]">{workspaceInitial("Acme Studio")}</span>
                </summary>
                <div className="absolute left-full top-0 z-50 ml-3 w-64 rounded-lg border border-slate-200 bg-white p-3 text-slate-800">
                  <p className="px-2 pb-2 text-[10px] font-semibold uppercase tracking-wider text-slate-400">Workspace</p>
                  <div className="flex items-center gap-2 rounded-md bg-[#f3e8ee] px-2 py-2 text-xs font-semibold text-[#91506a]"><span className="grid size-6 place-items-center rounded-md bg-white text-[10px] text-[#8d435f]">{workspaceInitial("Acme Studio")}</span>Acme Studio<Check className="ml-auto size-4 text-[#b45d7e]" aria-hidden="true" /></div>
                  <Button variant="ghost" size="sm" className="mt-2 h-8 w-full justify-start gap-2 rounded-md px-2 text-xs normal-case tracking-normal text-slate-600 hover:bg-[#f3e8ee] hover:text-[#91506a]" type="button" onClick={() => requestAuth("sign-up")}><Plus className="size-4" aria-hidden="true" />Create or join a workspace</Button>
                  <Button variant="ghost" size="sm" className="mt-1 h-8 w-full justify-start gap-2 rounded-md px-2 text-xs normal-case tracking-normal text-slate-600 hover:bg-[#f3e8ee] hover:text-[#91506a]" type="button" onClick={(event) => { setActiveTab("settings"); event.currentTarget.closest("details")?.removeAttribute("open"); }}><Settings className="size-3.5" aria-hidden="true" />Workspace settings</Button>
                </div>
              </details>
              <Button variant="ghost" size="sm" className="group flex h-[58px] w-full flex-col gap-1 rounded-lg bg-transparent p-1 text-white normal-case tracking-normal hover:bg-transparent" type="button" onClick={() => setActiveTab("messages")} aria-pressed={activeTab === "messages"} aria-label="Channels"><span className={`grid size-10 place-items-center rounded-lg transition-colors ${activeTab === "messages" ? "bg-[#b45d7e] text-white" : "bg-transparent text-white/60 group-hover:bg-white/10 group-hover:text-white"}`}><MessageSquareText className="size-5" aria-hidden="true" /></span><span className={`text-[10px] font-semibold ${activeTab === "messages" ? "text-white" : "text-white/60 group-hover:text-white"}`}>Channels</span></Button>
              <div className="flex-1" />
              <details ref={accountMenuRef} className="group relative z-30">
                <summary className="cursor-pointer list-none rounded-lg p-0.5 hover:bg-white/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300" aria-label="Open your account menu"><Avatar name="Guest" tone="white" className="size-10 text-base" /></summary>
                <div className="absolute bottom-0 left-full z-50 ml-3 w-64 rounded-lg border border-slate-200 bg-white p-4 text-slate-800">
                  <div className="flex items-center gap-3"><Avatar name="Guest" tone="white" className="size-10 text-base" /><div><p className="text-sm font-semibold">Guest preview</p><p className="text-xs text-slate-500">Sign in to your Bebop account</p></div></div>
                  <div className="mt-3 grid gap-1 border-t border-slate-100 pt-3"><Button variant="ghost" size="sm" className="h-8 justify-start rounded-md px-2 text-xs normal-case tracking-normal text-slate-700 hover:bg-[#f3e8ee] hover:text-[#91506a]" type="button" onClick={() => requestAuth("sign-in")}>Sign in</Button><Button size="sm" className="h-8 justify-start rounded-md bg-[#b45d7e] px-2 text-xs normal-case tracking-normal text-white hover:bg-[#9e4b6b]" type="button" onClick={() => requestAuth("sign-up")}>Create account</Button></div>
                </div>
              </details>
            </aside>
            <aside className="min-w-0 rounded-l-[14px] border-r border-slate-200 bg-white p-4 text-slate-800">
              {activeTab === "messages" ? <>
                <div className="mb-3 flex min-h-10 items-center justify-between border-b border-slate-100 pb-2 pl-1 text-[10px] font-semibold uppercase tracking-wider text-slate-500"><span>Channels</span><Button variant="ghost" size="icon-xs" className="rounded-md text-slate-500 normal-case tracking-normal hover:bg-[#f3e8ee] hover:text-[#91506a]" type="button" aria-label="Create a channel" onClick={() => requestAuth("sign-up")}><Plus className="size-4" aria-hidden="true" /></Button></div>
                <div className="grid gap-1">{searchedDemoChannels.map((item) => <Button key={item.id} variant="ghost" size="sm" className={`h-9 min-w-0 justify-start gap-2 overflow-hidden rounded-md px-2 text-left text-xs normal-case tracking-normal ${item.id === activeChannelId ? "bg-[#f3e8ee] font-semibold text-[#91506a]" : "text-slate-600"}`} type="button" onClick={() => { setActiveChannelId(item.id); setActiveChannelView("messages"); }} aria-current={item.id === activeChannelId ? "page" : undefined}><span className="grid w-4 shrink-0 place-items-center text-slate-400" aria-hidden="true">{item.locked ? <LockKeyhole className="size-3.5" /> : <Hash className="size-4" />}</span><span className="truncate">{item.name}</span></Button>)}{searchText && !searchedDemoChannels.length && <p className="px-2 py-2 text-xs leading-5 text-slate-500">No channels match “{searchQuery}”.</p>}</div>
              </> : <div className="mt-7"><span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Workspace settings</span><p className="mt-2 text-xs leading-5 text-slate-500">Manage people in Acme Studio.</p></div>}
            </aside>
            <section className="flex min-w-0 min-h-[600px] flex-col overflow-hidden rounded-r-[14px] bg-white text-slate-900" aria-label={activeTab === "messages" ? "Channels preview" : "Workspace settings preview"}>
              {activeTab === "messages" ? <>
                <header className="flex min-h-[68px] items-center justify-between gap-4 border-b border-slate-200 px-6 py-3"><div><h2 className="flex items-baseline gap-2 text-base font-semibold"><span className="text-slate-500">{channel.locked ? <LockKeyhole className="size-4" aria-hidden="true" /> : <Hash className="size-4" aria-hidden="true" />}</span>{channel.name}</h2></div><Button variant="outline" size="sm" className="shrink-0 rounded-md normal-case tracking-normal text-[#91506a]" type="button" onClick={() => requestAuth("sign-up")}>Create your workspace</Button></header>
                <ChannelTabs value={activeChannelView} onChange={setActiveChannelView} idPrefix="preview-channel" memberCount={demoChannelMembers.length} />
                {activeChannelView === "messages" ? <>
                  <div className="flex-1 overflow-y-auto px-6 py-5" id="preview-channel-messages-panel" role="tabpanel" aria-labelledby="preview-channel-messages-tab">{demoMessages[channel.id].map((entry, index) => <article className="mb-6 grid grid-cols-[40px_minmax(0,1fr)] gap-2" key={`${channel.id}-${index}`}><div className="size-10 rounded-[14px] bg-[#d9d9d9]" aria-hidden="true" /><div className="min-w-0"><header className="flex flex-wrap items-baseline gap-x-2 gap-y-1"><strong className="text-sm">{entry.author}</strong><time className="text-xs text-slate-400">{entry.time}</time></header><p className="mt-0.5 whitespace-pre-wrap break-words text-sm leading-5 text-slate-700">{entry.content}</p></div></article>)}</div>
                  <JoinChannelPrompt channelName={channel.name} onJoin={() => requestAuth("sign-up")} />
                </> : <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5" id="preview-channel-members-panel" role="tabpanel" aria-labelledby="preview-channel-members-tab"><div className="mx-auto max-w-3xl"><div className="border-b border-slate-100 pb-4"><h3 className="text-sm font-semibold">Channel members</h3><p className="mt-1 text-xs text-slate-500">People who belong to #{channel.name}.</p></div><MemberRoster members={demoChannelMembers} rolePrefix="Channel" /><Button variant="outline" size="sm" className="mt-4 gap-1 rounded-md normal-case tracking-normal" type="button" onClick={() => requestAuth("sign-up")}>Invite a member<ArrowUpRight className="size-3.5" aria-hidden="true" /></Button></div></div>}
              </> : <div className="min-h-0 flex-1 overflow-y-auto p-6">
                <div className="mx-auto max-w-4xl"><header className="border-b border-slate-200 pb-5"><p className="text-[10px] font-medium uppercase tracking-wider text-slate-400">Acme Studio / Settings</p><h2 className="mt-1 text-2xl font-semibold tracking-tight">Workspace settings</h2></header><section className="mt-6 max-w-2xl overflow-hidden rounded-lg border border-slate-200 bg-white"><header className="flex items-start justify-between gap-4 border-b border-slate-100 px-4 py-3"><div><h3 className="text-sm font-semibold">Members</h3><p className="mt-1 text-xs text-slate-500">People who belong to Acme Studio.</p></div><span className="rounded-full bg-slate-100 px-2 py-1 text-[10px] text-slate-500">{demoWorkspaceMembers.length}</span></header><div className="px-4"><MemberRoster members={demoWorkspaceMembers} rolePrefix="Workspace" /></div></section></div>
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
