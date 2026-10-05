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
  return <div className={`relative flex min-h-16 flex-wrap items-center justify-between gap-3 border border-dashed px-4 py-3 text-[13px] ${dragging ? "border-primary bg-primary/10" : "border-border bg-muted/30"}`}
    onDragOver={(event) => { if (disabled) return; event.preventDefault(); setDragging(true); }}
    onDragLeave={() => setDragging(false)}
    onDrop={(event) => { event.preventDefault(); setDragging(false); if (!disabled && event.dataTransfer.files[0]) onFile(event.dataTransfer.files[0]); }}>
    <input ref={input} type="file" accept={accept} className="sr-only" disabled={disabled} onChange={(event) => {
      const file = event.target.files?.[0];
      if (file) onFile(file);
      event.currentTarget.value = "";
    }} />
    <div className="flex flex-wrap items-center gap-2">
      <Button type="button" variant="secondary" size="sm" disabled={disabled} onClick={() => input.current?.click()}><ImagePlus size={15} /> {label}</Button>
      {chooseExisting && <><span className="text-muted-foreground">or</span><Button type="button" variant="secondary" size="sm" disabled={disabled} onClick={chooseExisting}>Choose from existing</Button></>}
    </div>
    <span className="text-xs text-muted-foreground">or drag and drop a file</span>
    {error && <p className="w-full text-xs text-destructive" role="alert">{error}</p>}
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
  const [preview, setPreview] = useState<{ url: string; mimeType: string }>();
  const [error, setError] = useState<string>();
  useEffect(() => {
    let active = true;
    let objectUrl: string | undefined;
    setPreview(undefined);
    setError(undefined);
    const operations = mediaOperations(client, collection);
    if (!operations?.readFile) return;
    void operations.readFile(id).then((blob) => {
      if (!active) return;
      if (!blob) { setError("File is unavailable."); return; }
      objectUrl = URL.createObjectURL(blob);
      setPreview({ url: objectUrl, mimeType: blob.type });
    }).catch((cause: unknown) => {
      if (active) setError(cause instanceof Error ? cause.message : "Could not load file.");
    });
    return () => { active = false; if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [client, collection, id]);
  const resolvedMimeType = mimeType ?? preview?.mimeType;
  if (error) return <p className="text-xs text-destructive" role="alert">{error}</p>;
  if (!preview) return compact ? <span className="flex size-10 shrink-0 items-center justify-center border border-border bg-background text-muted-foreground"><FileText size={18} /></span> : <p className="text-xs text-muted-foreground">Loading file…</p>;
  if (compact) return resolvedMimeType?.startsWith("image/")
    ? <img className="size-10 shrink-0 border border-border bg-background object-contain" src={preview.url} alt="" />
    : <span className="flex size-10 shrink-0 items-center justify-center border border-border bg-background text-muted-foreground"><FileText size={18} /></span>;
  return <div className="flex flex-col items-start gap-2 [&_img]:max-h-64 [&_img]:max-w-full [&_img]:border [&_img]:border-border [&_img]:object-contain">
    {resolvedMimeType?.startsWith("image/") && <img src={preview.url} alt={filename ?? "Uploaded image"} />}
    <a href={preview.url} download={filename || "download"} className="inline-flex items-center gap-2 text-xs text-foreground underline underline-offset-2"><Download size={14} /> {filename || "Download file"}</a>
  </div>;
}

export function PendingUploadPreview({ file, onClear }: { file: File; onClear: () => void }) {
  const [preview, setPreview] = useState<{ file: File; url: string }>();
  const isImage = file.type.startsWith("image/");

  useEffect(() => {
    if (!isImage) {
      setPreview(undefined);
      return;
    }

    const url = URL.createObjectURL(file);
    setPreview({ file, url });
    return () => URL.revokeObjectURL(url);
  }, [file, isImage]);

  const previewUrl = preview?.file === file ? preview.url : undefined;
  const size = `${Math.max(1, Math.ceil(file.size / 1024))} KB`;
  const details = file.type ? `${size} — ${file.type}` : size;

  return <div className="flex min-h-[124px] items-stretch gap-5 border border-border bg-muted/30">
    {isImage && previewUrl
      ? <img className="h-[124px] w-[120px] shrink-0 bg-white object-contain" src={previewUrl} alt="" />
      : <span className="flex h-[124px] w-[120px] shrink-0 items-center justify-center bg-background text-muted-foreground" aria-hidden="true"><FileText size={24} /></span>}
    <div className="flex min-w-0 flex-1 flex-col justify-center gap-2 py-4 text-[13px]">
      <span className="truncate" title={file.name}>{file.name}</span>
      <span className="text-xs text-muted-foreground">{details}</span>
    </div>
    <div className="flex shrink-0 items-start p-3">
      <Button type="button" variant="ghost" size="icon" aria-label={`Remove selected file ${file.name}`} title="Remove selected file" onClick={onClear}><X size={16} /></Button>
    </div>
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
  return <div className="flex flex-col gap-3">
    {value ? <div className="flex min-h-16 items-center gap-3 border border-border bg-muted/30 px-3 py-2 text-sm">
      <MediaPreview client={client} collection={field.relationTo ?? ""} id={value} filename={selected?.filename} mimeType={selected?.mimeType} compact />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="truncate">{selected?.filename ?? value}</span>
        {selected && <span className="text-xs text-muted-foreground">{Math.max(1, Math.ceil(selected.filesize / 1024))} KB{selected.mimeType ? ` — ${selected.mimeType}` : ""}</span>}
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <Button type="button" variant="ghost" size="icon-xs" aria-label={`Edit ${selected?.filename ?? "media"}`} title="Edit media" onClick={() => onEdit(value)}><Pencil size={14} /></Button>
        <Button type="button" variant="ghost" size="icon-xs" aria-label={`Remove ${selected?.filename ?? "media"}`} title="Remove from field" onClick={() => { onChange(null); onBlur(); }}><X size={15} /></Button>
      </div>
    </div> : <>
      <div className={`relative flex min-h-16 flex-wrap items-center justify-between gap-3 border border-dashed px-4 py-3 text-[13px] ${dragging ? "border-primary bg-primary/10" : "border-border bg-muted/30"}`}
        onDragOver={(event) => { event.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => { event.preventDefault(); setDragging(false); const file = event.dataTransfer.files[0]; if (file) requestCreate(file); }}>
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" variant="secondary" size="sm" onClick={() => requestCreate()}><ImagePlus size={15} /> Create New</Button>
          <span className="text-muted-foreground">or</span>
          <Button type="button" variant="secondary" size="sm" onClick={onChooseExisting}>Choose from existing</Button>
        </div>
        <span className="text-xs text-muted-foreground">or drag and drop a file</span>
      </div>
    </>}
    {error && <p className="w-full text-xs text-destructive" role="alert">{error}</p>}
    <button id={`field-${field.name}`} type="button" className="sr-only" tabIndex={-1} ref={inputRef} onBlur={onBlur} aria-label={`Select ${field.label}`} />
  </div>;
}
