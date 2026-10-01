import { EditorHeading, EditorMeta, EditorField, NotFoundPage } from "../components/common.js";
import { RelatedCollectionLabels } from "../components/related-labels.js";
import { FieldInput } from "../components/field-input.js";
import { CollectionList } from "./collection-list.js";
import { JoinFieldPanel } from "./join-field-panel.js";
import { useCallback, useMemo, useRef, useState, useEffect } from "react";
import { useDb, useOne } from "jazz-tools/react";

import type { PermissionAdvice } from "jazz-tools";
import { useForm, FieldValues } from "react-hook-form";
import { X } from "lucide-react";
import { useNavigate, useOutletContext } from "react-router-dom";
import type { BebopAdminCollection, BebopAdminJoinField, BebopAdminManifest, BebopAdminStoredField } from "../../../types.js";

import { Button } from "../../../components/ui/button.js";

import { Label } from "../../../components/ui/label.js";

import { useToastManager } from "../../../components/ui/toast.js";
import { Drawer, DrawerContent, DrawerTitle } from "../../../components/ui/drawer.js";
import { AdminPortalContainer } from "../../../lib/admin-portal.js";
import { MediaPreview, PendingUploadPreview, UploadDropzone, validateSelectedFile } from "../../upload.js";
import type { BebopAdminClient, BebopAdminProps, AdminOutletContext } from "../types.js";
import type { AdminRecord, AdminDatabase, RelationOption } from "../data-access.js";
import { getTable, getMutations } from "../data-access.js";

import { formatDate, valueFor, collectionTitleFields, composeCollectionTitle, recordTitle, storedFields } from "../record-values.js";
import { initialValues, serializeValues } from "../form-values.js";
import { remoteChangeAction } from "../editor-conflict.js";

import { JoinNavigationContext } from "../join-context.js";

export type MediaDialogState =
  | { mode: "choose"; fieldName: string; collectionSlug: string }
  | { mode: "create"; fieldName: string; collectionSlug: string; initialFile?: File; returnToChoose: boolean }
  | { mode: "edit"; fieldName: string; collectionSlug: string; id: string };

export type EditorModalOptions = {
  initialFile?: File;
  onClose: () => void;
  onComplete: (id: string) => void;
};

export function DocumentEditor({ app, client, manifest, collection, id, createDefaults, preflightCreate, preflightUpdate, joinContext, relationOptions, modal }: { app: object; client: BebopAdminClient; manifest: BebopAdminManifest; collection: BebopAdminCollection; id?: string; createDefaults?: Readonly<Record<string, unknown>>; preflightCreate?: BebopAdminProps["preflightCreate"]; preflightUpdate?: BebopAdminProps["preflightUpdate"]; joinContext?: JoinNavigationContext; relationOptions?: BebopAdminProps["relationOptions"]; modal?: EditorModalOptions }) {
  const navigate = useNavigate();
  const toast = useToastManager();
  const { setDocumentBreadcrumb } = useOutletContext<AdminOutletContext>();
  const mediaPortal = useRef<HTMLDivElement>(null);
  const db = useDb() as AdminDatabase;
  const table = getTable(app, collection.slug);
  const documentQuery = id ? getMutations(client, collection.slug)?.query({ where: { id }, includeTimestamps: true }) : undefined;
  const { data: existing, isLoading, error } = useOne<AdminRecord>(documentQuery, collection.writeMode === "command" ? { tier: "remote" } : undefined);
  const existingVersion = existing ? JSON.stringify(existing) : undefined;
  const createFieldDefaults = useMemo(() => ({
    ...createDefaults,
    ...(joinContext && !id ? { [joinContext.relationship.name]: joinContext.parentId } : {}),
  }), [createDefaults, id, joinContext]);
  const form = useForm<FieldValues>({ defaultValues: id ? {} : initialValues(collection, undefined, createFieldDefaults) });
  const { register, handleSubmit, reset, setValue, formState: { errors, isSubmitting, isDirty, dirtyFields } } = form;
  const baselineVersion = useRef<string | null>(null);
  const [remoteChanged, setRemoteChanged] = useState(false);
  const [permissionAdvice, setPermissionAdvice] = useState<PermissionAdvice>("unknown");
  const [readAdvice, setReadAdvice] = useState<PermissionAdvice>("unknown");
  const [saveError, setSaveError] = useState<string>();
  const [saveApplied, setSaveApplied] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | undefined>(() => modal?.initialFile);
  const [fileError, setFileError] = useState<string>();
  const [mediaDialog, setMediaDialog] = useState<MediaDialogState>();
  const joinReturnPath = joinContext && (!id || existing?.[joinContext.relationship.storageName] === joinContext.parentId)
    ? joinContext.returnTo
    : undefined;
  const watchedValues = form.watch();
  const serializedValues = useMemo(() => serializeValues(collection, watchedValues), [collection, watchedValues]);
  const serializedValuesKey = JSON.stringify(serializedValues);
  const titleFields = collectionTitleFields(collection);
  const [titleRelationOptions, setTitleRelationOptions] = useState<Record<string, readonly RelationOption[]>>({});
  const onTitleRelatedOptions = useCallback((slug: string, options: readonly RelationOption[]) => {
    setTitleRelationOptions((current) => {
      const previous = current[slug];
      if (previous?.length === options.length && previous.every((option, index) => option.id === options[index].id && option.name === options[index].name)) return current;
      return { ...current, [slug]: options };
    });
  }, []);
  const titleRelationIds = new Map<string, Set<string>>();
  for (const field of titleFields) {
    if (field.kind !== "relation" || !field.relationTo) continue;
    const value = Object.hasOwn(watchedValues, field.name) ? watchedValues[field.name] : existing ? valueFor(field, existing) : undefined;
    if (typeof value !== "string" || !value) continue;
    const ids = titleRelationIds.get(field.relationTo) ?? new Set<string>();
    ids.add(value);
    titleRelationIds.set(field.relationTo, ids);
  }
  const resolvedTitleRelationOptions = useMemo(() => ({ ...titleRelationOptions, ...relationOptions }), [relationOptions, titleRelationOptions]);
  const titleValue = composeCollectionTitle(
    collection,
    (field) => Object.hasOwn(watchedValues, field.name) ? watchedValues[field.name] : existing ? valueFor(field, existing) : undefined,
    resolvedTitleRelationOptions,
  );
  const title = titleValue ?? (id ? `Untitled ${collection.labels.singular.toLocaleLowerCase()}` : `New ${collection.labels.singular}`);
  const parentLabel = (existing ? recordTitle(collection, existing, resolvedTitleRelationOptions) : undefined) ?? id ?? "";
  const mainFields = collection.fields.filter((field): field is BebopAdminStoredField => field.kind !== "join" && !field.generated && !field.admin?.hidden && field.admin?.position !== "sidebar");
  const sidebarFields = collection.fields.filter((field): field is BebopAdminStoredField => field.kind !== "join" && !field.generated && !field.admin?.hidden && field.admin?.position === "sidebar");
  const joinFields = collection.fields.filter((field): field is BebopAdminJoinField => field.kind === "join");

  useEffect(() => { if (!modal) setDocumentBreadcrumb(id ? title : undefined); }, [id, modal, setDocumentBreadcrumb, title]);

  useEffect(() => {
    if (!existing || existingVersion === undefined) return;
    if (baselineVersion.current === null) {
      baselineVersion.current = existingVersion;
      reset(initialValues(collection, existing));
      return;
    }
    const action = remoteChangeAction({
      baseline: baselineVersion.current,
      latest: existingVersion,
      dirty: isDirty,
      conflict: remoteChanged,
    });
    if (action === "unchanged") return;
    if (action === "preserve-draft") {
      setRemoteChanged(true);
      return;
    }
    baselineVersion.current = existingVersion;
    reset(initialValues(collection, existing));
  }, [collection, existing, existingVersion, isDirty, remoteChanged, reset]);

  function reloadRemoteVersion() {
    if (!existing || existingVersion === undefined) return;
    baselineVersion.current = existingVersion;
    reset(initialValues(collection, existing));
    setRemoteChanged(false);
    setSaveError(undefined);
  }

  useEffect(() => {
    if (id || !createFieldDefaults) return;
    const defaults = initialValues(collection, undefined, createFieldDefaults);
    for (const field of storedFields(collection)) {
      if (Object.hasOwn(createFieldDefaults, field.name) && !dirtyFields[field.name]) {
        setValue(field.name, defaults[field.name], { shouldDirty: false });
      }
    }
  }, [collection, createFieldDefaults, dirtyFields, id, setValue]);

  useEffect(() => {
    let active = true;
    if (!id || !table) {
      setReadAdvice("unknown");
      return;
    }
    if (!existing) {
      setReadAdvice("unknown");
      return;
    }
    setReadAdvice("unknown");
    void db.canRead(table, id).then((advice) => {
      if (active) setReadAdvice(advice);
    }).catch(() => {
      if (active) setReadAdvice("unknown");
    });
    return () => { active = false; };
  }, [db, existing, id, table]);

  useEffect(() => {
    let active = true;
    if (collection.writeMode === "command") {
      setPermissionAdvice("unknown");
      return;
    }
    if (!table || (id && !existing)) {
      setPermissionAdvice("unknown");
      return;
    }
    if (collection.upload) {
      // Media metadata and its file id are assigned by the upload client after streaming.
      setPermissionAdvice("unknown");
      return;
    }
    setPermissionAdvice("unknown");
    const check = (async () => {
      if (id) {
        const preflight = await preflightUpdate?.(collection.slug, serializedValues);
        return preflight ?? db.canUpdate(table, id, serializedValues);
      }
      const preflight = await preflightCreate?.(collection.slug, serializedValues);
      return preflight ?? db.canInsert(table, serializedValues);
    })();
    void check.then((advice) => {
      if (active) setPermissionAdvice(advice);
    }).catch(() => {
      if (active) setPermissionAdvice("unknown");
    });
    return () => { active = false; };
  }, [collection.slug, collection.upload, collection.writeMode, db, existing, id, preflightCreate, preflightUpdate, serializedValuesKey, table]);

  if (error) return <div className="py-16 text-center text-sm text-destructive">Could not load document: {error.message}</div>;
  if (id && isLoading) return <div className="py-16 text-center text-sm text-muted-foreground">Loading document…</div>;
  if (id && !existing) return <NotFoundPage message="This document may have been deleted or is no longer available." />;
  if (id && collection.writeMode !== "command" && readAdvice === "denied") return <div className="py-16 text-center text-sm text-destructive" role="alert">Your current session cannot read this document.</div>;

  async function save(values: FieldValues) {
    if (remoteChanged) {
      setSaveError("This document changed elsewhere. Reload the latest version before saving.");
      return;
    }
    const document = serializeValues(collection, values);
    setSaveError(undefined);
    try {
      if (collection.upload && !id && !selectedFile) throw new Error("Choose a file before creating media.");
      if (selectedFile) {
        const validation = validateSelectedFile(selectedFile, collection.upload);
        if (validation) throw new Error(validation);
      }
      if (!table) throw new Error("The generated Bebop app is missing this collection.");
      const preflight = !collection.upload && collection.writeMode !== "command"
        ? await (id ? preflightUpdate?.(collection.slug, document) : preflightCreate?.(collection.slug, document))
        : undefined;
      const advice = collection.upload || collection.writeMode === "command" ? "unknown" : id
        ? preflight ?? await db.canUpdate(table, id, document)
        : preflight ?? await db.canInsert(table, document);
      setPermissionAdvice(advice);
      if (advice === "denied") throw new Error("Your current session cannot save this document.");
      const operations = getMutations(client, collection.slug);
      if (!operations) throw new Error("The Bebop mutation client is missing this collection.");
      const mutationData = selectedFile ? { ...document, file: selectedFile } : document;
      const result = id
        ? await operations.update(id, mutationData)
        : await operations.create(mutationData);
      const resultDoc = (result as { doc?: AdminRecord } | undefined)?.doc;
      const globallyConfirmed = (result as { durability?: string } | undefined)?.durability === "global";
      const toastTitle = `${collection.labels.singular} ${id ? "updated" : "created"}`;
      const confirmationToastId = toast.add({
        type: globallyConfirmed ? "success" : "loading",
        title: `${toastTitle}${globallyConfirmed ? "" : " locally"}`,
        description: globallyConfirmed ? "Jazz confirmed the change." : "Waiting for Jazz to confirm this change.",
        timeout: globallyConfirmed ? 5000 : 0,
      });
      const waitForGlobal = (result as { waitForGlobal?: () => Promise<void> } | undefined)?.waitForGlobal;
      if (!globallyConfirmed && typeof waitForGlobal === "function") {
        void waitForGlobal().then(() => {
          toast.update(confirmationToastId, {
            type: "success",
            title: toastTitle,
            description: "Jazz confirmed the change. It is available to other synced clients.",
            timeout: 5000,
          });
        }).catch((syncFailure) => {
          toast.update(confirmationToastId, {
            type: "error",
            title: `Could not sync ${collection.labels.singular.toLocaleLowerCase()}`,
            description: syncFailure instanceof Error ? syncFailure.message : "Jazz did not confirm the change.",
            timeout: 7000,
          });
        });
      }
      if (modal) {
        const completedId = typeof resultDoc?.id === "string" ? resultDoc.id : id;
        if (!completedId) throw new Error("The saved media document did not return an ID.");
        modal.onComplete(completedId);
        return;
      }
      if (joinReturnPath && joinContext && resultDoc?.[joinContext.relationship.storageName] === joinContext.parentId) {
        navigate(joinReturnPath);
      } else if (!id && joinFields.length > 0 && resultDoc?.id) {
        navigate(`/admin/collections/${collection.slug}/${encodeURIComponent(resultDoc.id)}`);
      } else {
        navigate(`/admin/collections/${collection.slug}`);
      }
    } catch (mutationFailure) {
      const localWriteApplied = mutationFailure instanceof Error && "localWriteApplied" in mutationFailure;
      setSaveApplied(localWriteApplied);
      setSaveError(localWriteApplied
        ? `${(mutationFailure as Error).message} The local change was applied and may still sync.`
        : mutationFailure instanceof Error ? mutationFailure.message : "The document could not be saved.");
      const fieldErrors = mutationFailure instanceof Error && "fieldErrors" in mutationFailure
        ? (mutationFailure as Error & { fieldErrors?: Record<string, string> }).fieldErrors
        : undefined;
      for (const [field, message] of Object.entries(fieldErrors ?? {})) {
        if (collection.fields.some((candidate) => candidate.kind !== "join" && candidate.name === field)) {
          form.setError(field, { type: "bebop", message });
        }
      }
      const writeAccepted = mutationFailure instanceof Error && "writeAccepted" in mutationFailure && (mutationFailure as Error & { writeAccepted?: boolean }).writeAccepted;
      toast.add({
        type: localWriteApplied || writeAccepted ? "warning" : "error",
        title: writeAccepted ? "Saved, but an after hook failed" : localWriteApplied ? "Local change needs attention" : "Could not save document",
        description: mutationFailure instanceof Error ? mutationFailure.message : "The document could not be saved.",
      });
    }
  }

  function renderField(field: BebopAdminStoredField) {
    return (
      <EditorField key={field.name} error={errors[field.name] ? String(errors[field.name]?.message ?? "Invalid value") : undefined}>
        {field.kind === "boolean" ? (
          <label className="flex min-h-10 cursor-pointer items-center gap-2 text-[13px]">
            <input type="checkbox" className="size-4 accent-primary" {...register(field.name, { required: field.required })} />
            <span>{field.label}</span>
            {field.required && <span className="text-destructive">*</span>}
          </label>
        ) : (
          <>
            <Label htmlFor={`field-${field.name}`} className="text-[13px] font-normal normal-case tracking-normal">
              {field.label}{field.required && <span className="text-destructive">*</span>}
            </Label>
            <FieldInput
              field={field}
              app={app}
              client={client}
              manifest={manifest}
              register={register}
              control={form.control}
              relationOptions={relationOptions}
              onCreateMedia={(file) => setMediaDialog({ mode: "create", fieldName: field.name, collectionSlug: field.relationTo ?? "", initialFile: file, returnToChoose: false })}
              onChooseMedia={() => setMediaDialog({ mode: "choose", fieldName: field.name, collectionSlug: field.relationTo ?? "" })}
              onEditMedia={(mediaId) => setMediaDialog({ mode: "edit", fieldName: field.name, collectionSlug: field.relationTo ?? "", id: mediaId })}
            />
          </>
        )}
      </EditorField>
    );
  }

  return (
    <div>
      {[...titleRelationIds].map(([slug, ids]) => {
        const relatedCollection = manifest.collections[slug];
        return relatedCollection ? <RelatedCollectionLabels
          key={`title:${slug}`}
          app={app}
          client={client}
          collection={relatedCollection}
          ids={[...ids].sort()}
          relationOptions={relationOptions}
          onChange={onTitleRelatedOptions}
        /> : null;
      })}
      <EditorHeading title={title} modal={Boolean(modal)} action={modal && <Button type="button" variant="ghost" size="icon" aria-label="Close media editor" onClick={modal.onClose}><X size={20} /></Button>} />
      <form onSubmit={handleSubmit(save)}>
        <EditorMeta
          modal={Boolean(modal)}
          details={id && collection.timestamps ? <>
            <span><span className="text-muted-foreground">Last Modified: </span>{formatDate(existing?.$updatedAt, true)}</span>
            <span><span className="text-muted-foreground">Created: </span>{formatDate(existing?.$createdAt, true)}</span>
          </> : <span className="text-muted-foreground">{modal ? `${id ? "Editing" : "Creating new"} ${collection.labels.singular}` : "New document"}</span>}
          actions={
            <>
              <Button variant="secondary" size="sm" type="submit" className="normal-case tracking-normal" disabled={isSubmitting || saveApplied || remoteChanged || permissionAdvice === "denied" || Boolean(id && !isDirty && !selectedFile)}>{saveApplied ? "Local write applied" : modal || id ? "Save" : "Create"}</Button>
              <Button variant="outline" size="sm" type="button" className="normal-case tracking-normal" onClick={() => modal ? modal.onClose() : navigate(joinReturnPath ?? `/admin/collections/${collection.slug}`)}>Cancel</Button>
            </>
          }
        />
        {permissionAdvice === "denied" && <p className="border-b border-border py-3 text-[13px] text-destructive" role="status">{id ? "Your current session cannot update this document." : "Your current session cannot create this document."}</p>}
        {remoteChanged && <div className="flex flex-wrap items-center justify-between gap-3 border-b border-amber-500/40 bg-amber-500/10 py-3 text-[13px]" role="alert">
          <span>This document changed elsewhere. Your draft is preserved, and saving is paused until you reload the latest version.</span>
          <Button type="button" variant="outline" size="sm" onClick={reloadRemoteVersion}>Reload latest</Button>
        </div>}
        {saveError && <p className="border-b border-border py-3 text-[13px] text-destructive" role="alert">{saveError}</p>}
        {saveApplied && !saveError && <p className="border-b border-border py-3 text-[13px] text-muted-foreground" role="status">The local change was applied. Jazz may still be syncing it.</p>}
        <fieldset disabled={Boolean(saveApplied || (id && permissionAdvice === "denied"))} className={`m-0 grid min-w-0 grid-cols-1 border-0 p-0 ${sidebarFields.length ? "lg:grid-cols-[minmax(0,1fr)_minmax(260px,31%)]" : ""}`}>
          <div className={`min-w-0 space-y-6 py-7 ${modal ? "px-6 lg:px-11" : "lg:pr-10"}`}>
            {collection.upload && <div className="flex flex-col gap-2">
              <Label className="text-[13px] font-normal">File {!id && <span className="text-destructive">*</span>}</Label>
              {selectedFile
                ? <PendingUploadPreview file={selectedFile} onClear={() => setSelectedFile(undefined)} />
                : id && typeof existing?.filename === "string" && <MediaPreview client={client} collection={collection.slug} id={id} filename={existing.filename} mimeType={String(existing.mimeType ?? "")} />}
              <UploadDropzone onFile={(file) => { setFileError(validateSelectedFile(file, collection.upload)); setSelectedFile(validateSelectedFile(file, collection.upload) ? undefined : file); }}
                accept={collection.upload.mimeTypes.join(",")} label={id ? "Replace file" : "Choose file"} error={fileError} />
            </div>}
            {mainFields.map(renderField)}
          </div>
          {sidebarFields.length > 0 && <aside className={`min-w-0 space-y-6 border-t border-border py-7 lg:border-t-0 lg:border-l ${modal ? "px-6 lg:px-11" : "lg:pl-8"}`} aria-label="Additional fields">
            {sidebarFields.map(renderField)}
            {id && <div className="flex flex-col gap-1 border-t border-border pt-5 text-xs text-muted-foreground"><span>Document ID</span><code className="break-all text-foreground">{id}</code></div>}
          </aside>}
        </fieldset>
      </form>
      {!modal && joinFields.map((field) => id && existing
        ? <JoinFieldPanel key={field.name} app={app} client={client} manifest={manifest} source={collection} field={field} parentId={id} parentLabel={parentLabel} relationOptions={relationOptions} />
        : <section key={field.name} className="mt-8 border-t pt-6">
            <h2 className="font-heading text-base font-semibold uppercase tracking-wide">{field.label}</h2>
            <p className="mt-2 text-sm text-muted-foreground">Save this {collection.labels.singular.toLocaleLowerCase()} before managing {manifest.collections[field.collection]?.labels.plural.toLocaleLowerCase() ?? field.label.toLocaleLowerCase()}.</p>
          </section>)}
      <Drawer
        open={Boolean(mediaDialog)}
        onOpenChange={(open) => {
          if (!open) {
            setMediaDialog((current) => current?.mode === "create" && current.returnToChoose
              ? { mode: "choose", fieldName: current.fieldName, collectionSlug: current.collectionSlug }
              : undefined);
          }
        }}
        swipeDirection="right"
      >
        <DrawerContent
          className="rounded-none border-l border-border bg-background font-sans text-foreground shadow-2xl bebop-admin"
          style={{ width: "90vw", height: "100dvh", maxHeight: "100dvh", margin: 0 }}
        >
          <div ref={mediaPortal} className="h-full min-h-0 overflow-y-auto">
            {mediaDialog && (() => {
              const mediaCollection = manifest.collections[mediaDialog.collectionSlug];
              if (!mediaCollection) return null;
              const closeMediaDialog = () => {
                if (mediaDialog.mode === "create" && mediaDialog.returnToChoose) {
                  setMediaDialog({ mode: "choose", fieldName: mediaDialog.fieldName, collectionSlug: mediaDialog.collectionSlug });
                } else setMediaDialog(undefined);
              };
              const selectMedia = (mediaId: string) => {
                setValue(mediaDialog.fieldName, mediaId, { shouldDirty: true, shouldValidate: true });
                setMediaDialog(undefined);
              };
              return <>
                <DrawerTitle className="sr-only">
                  {mediaDialog.mode === "choose" ? `Choose ${mediaCollection.labels.plural}` : `${mediaDialog.mode === "create" ? "Create" : "Edit"} ${mediaCollection.labels.singular}`}
                </DrawerTitle>
                <AdminPortalContainer.Provider value={mediaPortal}>
                  {mediaDialog.mode === "choose" ? <div className="relative min-h-full px-6 py-8 lg:px-15 max-md:px-4 max-md:py-5">
                    <Button type="button" className="absolute right-4 top-4 z-10" variant="ghost" size="icon" aria-label="Close media picker" onClick={closeMediaDialog}><X size={20} /></Button>
                    <CollectionList
                      app={app}
                      client={client}
                      collection={mediaCollection}
                      manifest={manifest}
                      relationOptions={relationOptions}
                      selectMode
                      onSelect={(row) => selectMedia(row.id)}
                      onCreate={() => setMediaDialog({ mode: "create", fieldName: mediaDialog.fieldName, collectionSlug: mediaDialog.collectionSlug, returnToChoose: true })}
                    />
                  </div> : <DocumentEditor
                    key={`${mediaDialog.mode}:${mediaDialog.mode === "edit" ? mediaDialog.id : "new"}`}
                    app={app}
                    client={client}
                    manifest={manifest}
                    collection={mediaCollection}
                    id={mediaDialog.mode === "edit" ? mediaDialog.id : undefined}
                    relationOptions={relationOptions}
                    modal={{
                      initialFile: mediaDialog.mode === "create" ? mediaDialog.initialFile : undefined,
                      onClose: closeMediaDialog,
                      onComplete: selectMedia,
                    }}
                  />}
                </AdminPortalContainer.Provider>
              </>;
            })()}
          </div>
        </DrawerContent>
      </Drawer>
    </div>
  );
}
