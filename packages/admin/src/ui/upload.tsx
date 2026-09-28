import { useEffect, useRef, useState } from "react";
import { useAll } from "jazz-tools/react";
import type { QueryBuilder } from "jazz-tools";
import { Download, FileText, ImagePlus, Pencil, X } from "lucide-react";
import { Button } from "../components/ui/button.js";
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

export function MediaPreview({ client, collection, id, filename, mimeType, compact = false }: {
  client: object;
  collection: string;
  id: string;
  filename?: string;
  mimeType?: string;
  compact?: boolean;
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
  if (!url) return compact ? <span className="admin-media-thumbnail-placeholder"><FileText size={18} /></span> : <p className="text-xs text-muted-foreground">Loading file…</p>;
  if (compact) return mimeType?.startsWith("image/")
    ? <img className="admin-media-thumbnail" src={url} alt="" />
    : <span className="admin-media-thumbnail-placeholder"><FileText size={18} /></span>;
  return <div className="admin-media-preview">
    {mimeType?.startsWith("image/") && <img src={url} alt={filename ?? "Uploaded image"} />}
    <a href={url} download={filename || "download"} className="admin-media-download"><Download size={14} /> {filename || "Download file"}</a>
  </div>;
}

export function UploadFieldInput({ field, client, collection, value, onChange, onBlur, inputRef, onCreateNew, onChooseExisting, onEdit }: {
  field: BebopAdminStoredField;
  client: object;
  collection: BebopAdminCollection | undefined;
  value: string | null;
  onChange: (value: string | null) => void;
  onBlur: () => void;
  inputRef: (instance: HTMLButtonElement | null) => void;
  onCreateNew: (file?: File) => void;
  onChooseExisting: () => void;
  onEdit: (id: string) => void;
}) {
  const operations = mediaOperations(client, field.relationTo ?? "");
  const { data: media } = useAll<MediaRow>(operations?.query());
  const [error, setError] = useState<string>();
  const selected = media?.find((row) => row.id === value);
  function requestCreate(file?: File) {
    setError(undefined);
    if (!file) { onCreateNew(); return; }
    const validation = validateSelectedFile(file, collection?.upload);
    if (validation) { setError(validation); return; }
    onCreateNew(file);
  }
  const [dragging, setDragging] = useState(false);
  return <div className="admin-upload-field">
    {value ? <div className="admin-upload-selected">
      <MediaPreview client={client} collection={field.relationTo ?? ""} id={value} filename={selected?.filename} mimeType={selected?.mimeType} compact />
      <div className="admin-upload-selected-details">
        <span className="truncate">{selected?.filename ?? value}</span>
        {selected && <span className="text-xs text-muted-foreground">{Math.max(1, Math.ceil(selected.filesize / 1024))} KB{selected.mimeType ? ` — ${selected.mimeType}` : ""}</span>}
      </div>
      <div className="admin-upload-selected-actions">
        <Button type="button" variant="ghost" size="icon-xs" aria-label={`Edit ${selected?.filename ?? "media"}`} title="Edit media" onClick={() => onEdit(value)}><Pencil size={14} /></Button>
        <Button type="button" variant="ghost" size="icon-xs" aria-label={`Remove ${selected?.filename ?? "media"}`} title="Remove from field" onClick={() => { onChange(null); onBlur(); }}><X size={15} /></Button>
      </div>
    </div> : <>
      <div className={`admin-upload-dropzone ${dragging ? "admin-upload-dragging" : ""}`}
        onDragOver={(event) => { event.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => { event.preventDefault(); setDragging(false); const file = event.dataTransfer.files[0]; if (file) requestCreate(file); }}>
        <div className="admin-upload-actions">
          <Button type="button" variant="secondary" size="sm" onClick={() => requestCreate()}><ImagePlus size={15} /> Create New</Button>
          <span className="text-muted-foreground">or</span>
          <Button type="button" variant="secondary" size="sm" onClick={onChooseExisting}>Choose from existing</Button>
        </div>
        <span className="admin-upload-hint">or drag and drop a file</span>
      </div>
    </>}
    {error && <p className="admin-upload-error" role="alert">{error}</p>}
    <button id={`field-${field.name}`} type="button" className="sr-only" tabIndex={-1} ref={inputRef} onBlur={onBlur} aria-label={`Select ${field.label}`} />
  </div>;
}
