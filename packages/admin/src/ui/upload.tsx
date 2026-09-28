import { useEffect, useRef, useState } from "react";
import { useAll } from "jazz-tools/react";
import type { QueryBuilder } from "jazz-tools";
import { Download, ImagePlus } from "lucide-react";
import { Button } from "../components/ui/button.js";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select.js";
import { useToastManager } from "../components/ui/toast.js";
import type { BebopAdminCollection, BebopAdminStoredField } from "../types.js";

type MediaRow = { id: string; filename: string; mimeType: string; filesize: number };
type MediaOperations = {
  query: () => QueryBuilder<MediaRow>;
  create: (data: Record<string, unknown>) => Promise<{ doc: MediaRow }>;
  readFile: (id: string) => Promise<Blob | null>;
};

function mediaOperations(client: object, slug: string): MediaOperations | undefined {
  return (client as Record<string, unknown>)[slug] as MediaOperations | undefined;
}

export function validateSelectedFile(file: File, upload: BebopAdminCollection["upload"]): string | undefined {
  if (!upload) return "This collection does not accept files.";
  if (file.size > upload.maxFileSize) return `File exceeds the ${Math.ceil(upload.maxFileSize / 1024 / 1024)} MiB limit.`;
  const mimeType = file.type || "application/octet-stream";
  if (upload.mimeTypes.length && !upload.mimeTypes.some((allowed) => allowed === mimeType || allowed.endsWith("/*") && mimeType.startsWith(allowed.slice(0, -1)))) {
    return `File type ${mimeType} is not allowed.`;
  }
  return undefined;
}

export function UploadDropzone({ onFile, accept, disabled, label = "Create New", chooseExisting, error }: {
  onFile: (file: File) => void;
  accept?: string;
  disabled?: boolean;
  label?: string;
  chooseExisting?: () => void;
  error?: string;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  return <div className={`admin-upload-dropzone ${dragging ? "admin-upload-dragging" : ""}`}
    onDragOver={(event) => { if (disabled) return; event.preventDefault(); setDragging(true); }}
    onDragLeave={() => setDragging(false)}
    onDrop={(event) => { event.preventDefault(); setDragging(false); if (!disabled && event.dataTransfer.files[0]) onFile(event.dataTransfer.files[0]); }}>
    <input ref={input} type="file" accept={accept} className="sr-only" disabled={disabled} onChange={(event) => {
      const file = event.target.files?.[0];
      if (file) onFile(file);
      event.currentTarget.value = "";
    }} />
    <div className="admin-upload-actions">
      <Button type="button" variant="secondary" size="sm" disabled={disabled} onClick={() => input.current?.click()}><ImagePlus size={15} /> {label}</Button>
      {chooseExisting && <><span className="text-muted-foreground">or</span><Button type="button" variant="secondary" size="sm" disabled={disabled} onClick={chooseExisting}>Choose from existing</Button></>}
    </div>
    <span className="admin-upload-hint">or drag and drop a file</span>
    {error && <p className="admin-upload-error" role="alert">{error}</p>}
  </div>;
}

export function MediaPreview({ client, collection, id, filename, mimeType }: {
  client: object;
  collection: string;
  id: string;
  filename?: string;
  mimeType?: string;
}) {
  const [url, setUrl] = useState<string>();
  const [error, setError] = useState<string>();
  useEffect(() => {
    let active = true;
    let objectUrl: string | undefined;
    setUrl(undefined);
    setError(undefined);
    const operations = mediaOperations(client, collection);
    if (!operations?.readFile) return;
    void operations.readFile(id).then((blob) => {
      if (!active) return;
      if (!blob) { setError("File is unavailable."); return; }
      objectUrl = URL.createObjectURL(blob);
      setUrl(objectUrl);
    }).catch((cause: unknown) => {
      if (active) setError(cause instanceof Error ? cause.message : "Could not load file.");
    });
    return () => { active = false; if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [client, collection, id]);
  if (error) return <p className="text-xs text-destructive" role="alert">{error}</p>;
  if (!url) return <p className="text-xs text-muted-foreground">Loading file…</p>;
  return <div className="admin-media-preview">
    {mimeType?.startsWith("image/") && <img src={url} alt={filename ?? "Uploaded image"} />}
    <a href={url} download={filename || "download"} className="admin-media-download"><Download size={14} /> {filename || "Download file"}</a>
  </div>;
}

export function UploadFieldInput({ field, client, collection, value, onChange, onBlur, inputRef }: {
  field: BebopAdminStoredField;
  client: object;
  collection: BebopAdminCollection | undefined;
  value: string | null;
  onChange: (value: string | null) => void;
  onBlur: () => void;
  inputRef: (instance: HTMLButtonElement | null) => void;
}) {
  const toast = useToastManager();
  const operations = mediaOperations(client, field.relationTo ?? "");
  const { data: media, isLoading } = useAll<MediaRow>(operations?.query());
  const [showExisting, setShowExisting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const selected = media?.find((row) => row.id === value);
  async function upload(file: File) {
    const validation = validateSelectedFile(file, collection?.upload);
    if (validation) { setError(validation); return; }
    if (!operations) { setError("The media collection is unavailable."); return; }
    setError(undefined);
    setBusy(true);
    try {
      const result = await operations.create({ file });
      onChange(result.doc.id);
      toast.add({ type: "success", title: "Media created locally", description: "Save this document to use the file. Jazz sync may still be pending." });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not upload file.");
    } finally { setBusy(false); }
  }
  return <div className="admin-upload-field">
    {value && <div className="admin-upload-selected">
      <div className="flex items-center justify-between gap-3"><span>{selected?.filename ?? value}</span><Button type="button" variant="ghost" size="sm" onClick={() => onChange(null)}>Remove</Button></div>
      {selected && <MediaPreview client={client} collection={field.relationTo ?? ""} id={value} filename={selected.filename} mimeType={selected.mimeType} />}
    </div>}
    <UploadDropzone onFile={(file) => void upload(file)} accept={collection?.upload?.mimeTypes.join(",")}
      disabled={busy} chooseExisting={() => setShowExisting((current) => !current)} error={error} />
    {showExisting && <Select value={value} onValueChange={(id) => { onChange(id); setShowExisting(false); }}>
      <SelectTrigger id={`field-${field.name}`} ref={inputRef} onBlur={onBlur} className="w-full"><SelectValue placeholder={isLoading ? "Loading media…" : "Select a file"} /></SelectTrigger>
      <SelectContent>{media?.map((row) => <SelectItem key={row.id} value={row.id}>{row.filename}</SelectItem>)}</SelectContent>
    </Select>}
  </div>;
}
