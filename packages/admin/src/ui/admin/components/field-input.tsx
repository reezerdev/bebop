import { useRowReadPermissions } from "../hooks/use-row-permissions.js";

import { useAll, useDb } from "jazz-tools/react";
import { Combobox } from "@base-ui/react/combobox";
import { useCallback, useContext, useEffect, useMemo, useRef, useState, type UIEvent } from "react";

import { Controller, Control, FieldValues, RegisterOptions, UseFormRegister } from "react-hook-form";
import { Check, ChevronDown, LoaderCircle, Search, X } from "lucide-react";

import type { BebopAdminManifest, BebopAdminStoredField } from "../../../types.js";

import { Button } from "../../../components/ui/button.js";
import { Input, inputBaseClassName } from "../../../components/ui/input.js";
import { cn } from "cn";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../../components/ui/select.js";

import { Textarea } from "../../../components/ui/textarea.js";

import { UploadFieldInput } from "../../upload.js";
import type { BebopAdminClient, BebopAdminProps, BebopRelationOption, BebopRelationOptionsLoader } from "../types.js";
import type { AdminRecord, AdminDatabase } from "../data-access.js";
import { getTable, getMutations } from "../data-access.js";

import { selectLabel, recordTitle } from "../record-values.js";
import { AdminPortalContainer } from "../../../lib/admin-portal.js";

export function FieldInput({
  field,
  app,
  client,
  manifest,
  register,
  control,
  relationOptions,
  relationOptionLoaders,
  onCreateMedia,
  onChooseMedia,
  onEditMedia,
}: {
  field: BebopAdminStoredField;
  app: object;
  client: BebopAdminClient;
  manifest: BebopAdminManifest;
  register: UseFormRegister<FieldValues>;
  control: Control<FieldValues>;
  relationOptions?: BebopAdminProps["relationOptions"];
  relationOptionLoaders?: BebopAdminProps["relationOptionLoaders"];
  onCreateMedia?: (file?: File) => void;
  onChooseMedia?: () => void;
  onEditMedia?: (id: string) => void;
}) {
  const rules: RegisterOptions<FieldValues, string> = {
    required: field.required && !field.admin?.readOnly ? `${field.label} is required.` : false,
    validate: (value) => {
      if (typeof value === "string" && value.trim() === "") return !field.required || field.admin?.readOnly || `${field.label} is required.`;
      if (field.kind === "text" && typeof value === "string") {
        if (field.minLength !== undefined && value.length < field.minLength) return `${field.label} must be at least ${field.minLength} characters.`;
        if (field.maxLength !== undefined && value.length > field.maxLength) return `${field.label} must be at most ${field.maxLength} characters.`;
      }
      if ((field.kind === "number" || field.kind === "integer") && value !== "" && value !== undefined) {
        const number = Number(value);
        if (!Number.isFinite(number)) return `Enter a valid ${field.label.toLocaleLowerCase()}.`;
        if (field.min !== undefined && number < field.min) return `${field.label} must be at least ${field.min}.`;
        if (field.max !== undefined && number > field.max) return `${field.label} must be at most ${field.max}.`;
      }
      if (field.kind === "relation" && value && relationOptions?.[field.relationTo ?? ""] && !relationOptionLoaders?.[field.relationTo ?? ""] && !relationOptions[field.relationTo ?? ""].some((option) => option.id === value)) return `Select a valid ${field.label.toLocaleLowerCase()}.`;
      if (field.kind === "json" && value) {
        try { JSON.parse(String(value)); } catch { return "Enter valid JSON."; }
      }
      if (field.kind === "integer" && value !== "" && !Number.isInteger(Number(value))) return "Enter a whole number.";
      return true;
    },
  };
  if (field.kind === "relation" && field.relationTo) {
    return (
      <Controller
        control={control}
        name={field.name}
        rules={rules}
        render={({ field: input }) => (
          <RelationInput
            field={field}
            app={app}
            client={client}
            manifest={manifest}
            value={typeof input.value === "string" && input.value ? input.value : null}
            onChange={input.onChange}
            onBlur={input.onBlur}
            inputRef={input.ref}
            options={relationOptions?.[field.relationTo ?? ""]}
            loadOptions={relationOptionLoaders?.[field.relationTo ?? ""]}
            disabled={field.admin?.readOnly}
          />
        )}
      />
    );
  }
  if (field.kind === "upload" && field.relationTo) {
    return <Controller control={control} name={field.name} rules={rules} render={({ field: input }) =>
      <UploadFieldInput field={field} client={client} collection={manifest.collections[field.relationTo ?? ""]}
        value={typeof input.value === "string" && input.value ? input.value : null}
        onChange={input.onChange} onBlur={input.onBlur} inputRef={input.ref}
        onCreateNew={(file) => onCreateMedia?.(file)} onChooseExisting={() => onChooseMedia?.()}
        onEdit={(id) => onEditMedia?.(id)} />
    } />;
  }
  if (field.kind === "select") {
    return (
      <Controller
        control={control}
        name={field.name}
        rules={rules}
        render={({ field: input }) => (
          <Select value={typeof input.value === "string" && input.value ? input.value : null} onValueChange={input.onChange}>
            <div className="relative">
              <SelectTrigger id={`field-${field.name}`} ref={input.ref} onBlur={input.onBlur} className="w-full pr-14">
                <SelectValue placeholder={`Select ${field.label.toLocaleLowerCase()}`}>
                  {(value: string | null) => value ? selectLabel(field, value) : `Select ${field.label.toLocaleLowerCase()}`}
                </SelectValue>
              </SelectTrigger>
              {!field.required && input.value && <ClearSelectionButton label={field.label} onClear={() => { input.onChange(""); input.onBlur(); }} />}
            </div>
            <SelectContent>
              {field.options?.map((option) => <SelectItem key={option} value={option}>{selectLabel(field, option)}</SelectItem>)}
            </SelectContent>
          </Select>
        )}
      />
    );
  }
  if (field.kind === "date") {
    const type = field.admin?.date?.pickerAppearance === "dayAndTime" ? "datetime-local" : "date";
    return (
      <Controller
        control={control}
        name={field.name}
        rules={rules}
        render={({ field: input }) => (
          <div className="relative">
            <Input
              id={`field-${field.name}`}
              type={type}
              className="pr-14"
              value={typeof input.value === "string" ? input.value : ""}
              onChange={input.onChange}
              onBlur={input.onBlur}
              ref={input.ref}
            />
            {!field.required && !field.admin?.readOnly && input.value && (
              <ClearSelectionButton label={field.label} onClear={() => { input.onChange(""); input.onBlur(); }} />
            )}
          </div>
        )}
      />
    );
  }
  const registration = register(field.name, rules);
  if (field.kind === "json") {
    return <Textarea id={`field-${field.name}`} rows={7} className="font-mono text-xs" placeholder="{}" {...registration} />;
  }
  if (field.kind === "text" && field.admin?.input === "textarea") {
    return <Textarea id={`field-${field.name}`} rows={7} {...registration} />;
  }
  const type = field.kind === "number" || field.kind === "integer" ? "number" : "text";
  return <Input id={`field-${field.name}`} type={type} step={field.kind === "integer" ? 1 : field.kind === "number" ? "any" : undefined} {...registration} />;
}

const relationPageSize = 25;

type LoadedRelationPage = {
  options: readonly BebopRelationOption[];
  hasMore: boolean;
  nextOffset: number;
};

function mergeRelationOptions(...groups: readonly (readonly BebopRelationOption[] | undefined)[]): BebopRelationOption[] {
  const unique = new Map<string, BebopRelationOption>();
  for (const group of groups) for (const option of group ?? []) unique.set(option.id, option);
  return [...unique.values()];
}

export function RelationInput({
  field,
  app,
  client,
  manifest,
  value,
  onChange,
  onBlur,
  inputRef,
  options,
  loadOptions,
  disabled = false,
}: {
  field: BebopAdminStoredField;
  app: object;
  client: BebopAdminClient;
  manifest: BebopAdminManifest;
  value: string | null;
  onChange: (value: string | null) => void;
  onBlur: () => void;
  inputRef: (instance: HTMLInputElement | null) => void;
  options?: readonly BebopRelationOption[];
  loadOptions?: BebopRelationOptionsLoader;
  disabled?: boolean;
}) {
  const relatedSlug = field.relationTo ?? "";
  const db = useDb() as AdminDatabase;
  const table = getTable(app, relatedSlug);
  const operations = getMutations(client, relatedSlug);
  const targetCollection = manifest.collections[relatedSlug];
  const [open, setOpen] = useState(false);
  const [inputSearch, setInputSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [page, setPage] = useState(0);
  const [loadedOptions, setLoadedOptions] = useState<readonly BebopRelationOption[]>([]);
  const [knownOptions, setKnownOptions] = useState<readonly BebopRelationOption[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [externalLoading, setExternalLoading] = useState(false);
  const [loadError, setLoadError] = useState<string>();
  const [localLookupStarted, setLocalLookupStarted] = useState(false);
  const requestId = useRef(0);
  const loadedPages = useRef(new Map<string, LoadedRelationPage>());
  const pendingFirstPages = useRef(new Map<string, Promise<LoadedRelationPage>>());
  const loadingMore = useRef(false);
  const localLoadingMore = useRef(false);
  const previousLocalRowCount = useRef(0);
  const portalContainer = useContext(AdminPortalContainer);

  useEffect(() => {
    if (open) setLocalLookupStarted(true);
  }, [open]);

  useEffect(() => {
    const timeout = window.setTimeout(() => setDebouncedSearch(inputSearch.trim()), 250);
    return () => window.clearTimeout(timeout);
  }, [inputSearch]);

  const rememberOptions = useCallback((nextOptions: readonly BebopRelationOption[]) => {
    setKnownOptions((current) => mergeRelationOptions(current, nextOptions));
  }, []);

  useEffect(() => {
    if (!loadOptions || !value || options?.some((option) => option.id === value) || knownOptions.some((option) => option.id === value)) return;
    let active = true;
    void loadOptions({ search: "", ids: [value], limit: 1, offset: 0 })
      .then((result) => { if (active) rememberOptions(result.options); })
      .catch((error: unknown) => console.error(`Could not load the selected ${field.label.toLocaleLowerCase()}:`, error));
    return () => { active = false; };
  }, [field.label, knownOptions, loadOptions, options, rememberOptions, value]);

  useEffect(() => {
    if (!loadOptions || !open) return;
    const currentRequestId = ++requestId.current;
    const cachedPage = loadedPages.current.get(debouncedSearch);
    if (cachedPage) {
      setLoadedOptions(cachedPage.options);
      setHasMore(cachedPage.hasMore);
      setExternalLoading(false);
      setLoadError(undefined);
      rememberOptions(cachedPage.options);
      return () => { requestId.current += 1; };
    }
    setLoadedOptions([]);
    setHasMore(false);
    setExternalLoading(true);
    setLoadError(undefined);
    let pendingPage = pendingFirstPages.current.get(debouncedSearch);
    if (!pendingPage) {
      pendingPage = loadOptions({ search: debouncedSearch, limit: relationPageSize, offset: 0 })
        .then((result) => {
          const page: LoadedRelationPage = { options: result.options, hasMore: result.hasMore, nextOffset: result.options.length };
          loadedPages.current.set(debouncedSearch, page);
          return page;
        })
        .finally(() => { pendingFirstPages.current.delete(debouncedSearch); });
      pendingFirstPages.current.set(debouncedSearch, pendingPage);
    }
    void pendingPage
      .then((page) => {
        if (currentRequestId !== requestId.current) return;
        setLoadedOptions(page.options);
        setHasMore(page.hasMore);
        rememberOptions(page.options);
      })
      .catch((error: unknown) => {
        if (currentRequestId !== requestId.current) return;
        setLoadError(error instanceof Error ? error.message : "Could not load related records.");
      })
      .finally(() => {
        if (currentRequestId === requestId.current) setExternalLoading(false);
      });
    return () => { requestId.current += 1; };
  }, [debouncedSearch, loadOptions, open, rememberOptions]);

  const sortField = useMemo(() => {
    if (!targetCollection) return "id";
    const preferredName = targetCollection.defaultColumns.find((name) => targetCollection.fields.some((field) => field.kind !== "join" && field.name === name));
    const preferredField = targetCollection.fields.find((candidate): candidate is BebopAdminStoredField => candidate.kind !== "join" && candidate.name === preferredName);
    const textField = targetCollection.fields.find((candidate): candidate is BebopAdminStoredField => candidate.kind === "text");
    return preferredField?.storageName ?? textField?.storageName ?? "id";
  }, [targetCollection]);
  const searchFields = useMemo(() => {
    if (!targetCollection) return [];
    if (targetCollection.listSearchableFields.length) return targetCollection.listSearchableFields;
    return targetCollection.fields.filter((candidate): candidate is BebopAdminStoredField => candidate.kind === "text").map((candidate) => candidate.storageName);
  }, [targetCollection]);
  const shouldRunLocalLookup = localLookupStarted || open;
  const localQuery = useMemo(() => {
    if (options || loadOptions || !shouldRunLocalLookup || !operations) return undefined;
    const visibleLimit = (page + 1) * relationPageSize;
    const queryOptions = {
      orderBy: { field: sortField, direction: "asc" as const },
      limit: visibleLimit + 1,
      offset: 0,
    };
    if (debouncedSearch && searchFields.length) {
      return operations.search({ search: debouncedSearch, fields: searchFields, ...queryOptions });
    }
    if (debouncedSearch && searchFields[0]) {
      return operations.query({ where: { [searchFields[0]]: { contains: debouncedSearch } }, ...queryOptions });
    }
    return operations.query(queryOptions);
  }, [debouncedSearch, loadOptions, operations, options, page, searchFields, shouldRunLocalLookup, sortField]);
  const { data: localRows, isLoading: localLoading, error: localError } = useAll<AdminRecord>(localQuery);
  const localReadPermissions = useRowReadPermissions(db, table, localRows ?? []);
  const localOptions = useMemo(() => (localRows ?? [])
    .filter((row) => localReadPermissions[row.id] !== "denied")
    .slice(0, (page + 1) * relationPageSize)
    .map((row) => ({ id: row.id, name: targetCollection ? recordTitle(targetCollection, row) ?? row.id : row.id })),
  [localReadPermissions, localRows, page, targetCollection]);
  const localHasMore = !loadOptions && !options && (localRows?.length ?? 0) > (page + 1) * relationPageSize;

  useEffect(() => {
    const rowCount = localRows?.length ?? 0;
    if (rowCount !== previousLocalRowCount.current) {
      previousLocalRowCount.current = rowCount;
      localLoadingMore.current = false;
    }
  }, [localRows]);

  const selectedLocalQuery = useMemo(() => {
    if (!value || options || loadOptions || localOptions.some((option) => option.id === value)) return undefined;
    return operations?.query({ where: { id: value }, limit: 1 });
  }, [loadOptions, localOptions, operations, options, value]);
  const { data: selectedLocalRows } = useAll<AdminRecord>(selectedLocalQuery);
  const selectedReadPermissions = useRowReadPermissions(db, table, selectedLocalRows ?? []);
  const selectedLocalOption = useMemo(() => {
    const row = (selectedLocalRows ?? []).find((candidate) => selectedReadPermissions[candidate.id] !== "denied");
    return row ? { id: row.id, name: targetCollection ? recordTitle(targetCollection, row) ?? row.id : row.id } : undefined;
  }, [selectedLocalRows, selectedReadPermissions, targetCollection]);
  const selectedOption = useMemo(() => mergeRelationOptions(options, knownOptions, loadedOptions, localOptions, selectedLocalOption ? [selectedLocalOption] : []).find((option) => option.id === value), [knownOptions, loadedOptions, localOptions, options, selectedLocalOption, value]);
  const currentPageOptions = loadOptions
    ? (inputSearch.trim() === debouncedSearch ? loadedOptions : [])
    : options ?? localOptions;
  const availableOptions = useMemo(() => mergeRelationOptions(currentPageOptions, selectedOption ? [selectedOption] : []), [currentPageOptions, selectedOption]);
  const optionLabels = useMemo(() => new Map(availableOptions.map((option) => [option.id, option.name])), [availableOptions]);
  const isSearching = open && inputSearch.trim() !== debouncedSearch;
  const isLoading = isSearching || (loadOptions ? externalLoading : !options && localLoading);
  const error = loadOptions ? loadError : localError ? "Could not load related records." : undefined;

  const loadMore = useCallback(() => {
    if (loadOptions) {
      if (!hasMore || externalLoading || loadingMore.current) return;
      const search = debouncedSearch;
      const currentPage = loadedPages.current.get(search) ?? {
        options: loadedOptions,
        hasMore,
        nextOffset: loadedOptions.length,
      };
      if (!currentPage.hasMore) return;
      loadingMore.current = true;
      const currentRequestId = ++requestId.current;
      const offset = currentPage.nextOffset;
      setExternalLoading(true);
      setLoadError(undefined);
      void loadOptions({ search, limit: relationPageSize, offset })
        .then((result) => {
          const latestPage = loadedPages.current.get(search) ?? currentPage;
          const nextPage: LoadedRelationPage = {
            options: mergeRelationOptions(latestPage.options, result.options),
            hasMore: result.hasMore,
            nextOffset: offset + result.options.length,
          };
          loadedPages.current.set(search, nextPage);
          rememberOptions(result.options);
          if (currentRequestId !== requestId.current) return;
          setLoadedOptions(nextPage.options);
          setHasMore(nextPage.hasMore);
        })
        .catch((caught: unknown) => {
          if (currentRequestId !== requestId.current) return;
          setLoadError(caught instanceof Error ? caught.message : "Could not load related records.");
        })
        .finally(() => {
          loadingMore.current = false;
          if (currentRequestId === requestId.current) setExternalLoading(false);
        });
      return;
    }
    if (localHasMore && !localLoadingMore.current) {
      localLoadingMore.current = true;
      setPage((current) => current + 1);
    }
  }, [debouncedSearch, externalLoading, hasMore, loadOptions, loadedOptions, localHasMore, rememberOptions]);

  const onOptionsScroll = useCallback((event: UIEvent<HTMLDivElement>) => {
    const element = event.currentTarget;
    if (element.scrollHeight - element.scrollTop - element.clientHeight <= 48) loadMore();
  }, [loadMore]);

  const placeholder = disabled
    ? "Assigned automatically when saved"
    : open ? `Search ${field.label.toLocaleLowerCase()}`
      : value ? selectedOption?.name ?? value
        : isLoading ? "Loading related records…"
          : `Select ${field.label.toLocaleLowerCase()}`;
  const inputValue = open ? inputSearch : value ? selectedOption?.name ?? value : "";

  return (
    <Combobox.Root
      items={availableOptions.map((option) => option.id)}
      value={value}
      inputValue={inputValue}
      open={open}
      onOpenChange={setOpen}
      onInputValueChange={(nextValue) => {
        if (!open) return;
        setInputSearch(nextValue);
        setPage(0);
        localLoadingMore.current = false;
      }}
      onValueChange={(nextValue) => {
        onChange(typeof nextValue === "string" && nextValue ? nextValue : null);
        onBlur();
        setOpen(false);
        setInputSearch("");
        setDebouncedSearch("");
        setPage(0);
      }}
      itemToStringLabel={(id) => optionLabels.get(String(id)) ?? String(id)}
      disabled={disabled}
      openOnInputClick
      autoHighlight
    >
      <div className="relative">
        <div className="relative">
          <Combobox.Input
            id={`field-${field.name}`}
            ref={inputRef}
            data-slot="input"
            aria-label={field.label}
            aria-required={field.required || undefined}
            onBlur={onBlur}
            placeholder={placeholder}
            className={cn(inputBaseClassName, "pr-14")}
          />
          {!disabled && <ChevronDown aria-hidden="true" size={14} className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground" />}
        </div>
        {!disabled && !field.required && value && <ClearSelectionButton label={field.label} onClear={() => { onChange(null); onBlur(); }} />}
      </div>
      <Combobox.Portal container={portalContainer}>
        <Combobox.Positioner side="bottom" sideOffset={4} align="center" className="isolate z-50">
          <Combobox.Popup className="relative isolate z-50 max-h-(--available-height) w-(--anchor-width) min-w-36 overflow-x-hidden overflow-y-auto rounded-none bg-popover text-popover-foreground shadow-md ring-1 ring-foreground/10">
            <div className="flex items-center gap-2 border-b border-border px-3 py-2 text-muted-foreground">
              <Search aria-hidden="true" size={14} />
              <span className="sr-only">Search</span>
              <p className="text-xs">Search {field.label.toLocaleLowerCase()}</p>
            </div>
            <Combobox.List className="max-h-64 overflow-y-auto p-1.5" onScroll={onOptionsScroll}>
              {availableOptions.map((option, index) => <Combobox.Item key={option.id} value={option.id} index={index} className="relative flex w-full cursor-default items-center gap-2.5 rounded-none py-2 pr-8 pl-3 text-sm outline-none select-none data-[highlighted]:bg-accent data-[highlighted]:text-accent-foreground">
                <span className="flex-1">{option.name}</span>
                {option.id === value && <Check aria-hidden="true" size={14} className="absolute right-2" />}
              </Combobox.Item>)}
            </Combobox.List>
            {isLoading && <div role="status" className="flex items-center gap-2 px-3 py-2 text-sm text-muted-foreground"><LoaderCircle aria-hidden="true" size={14} className="animate-spin" /> Loading…</div>}
            {!isLoading && error && <div role="alert" className="px-3 py-2 text-sm text-destructive">{error}</div>}
            {!isLoading && !error && availableOptions.length === 0 && <div className="px-3 py-2 text-sm text-muted-foreground">{debouncedSearch ? "No matching records." : "No related records."}</div>}
            {!isLoading && !error && (loadOptions ? hasMore : localHasMore) && <button type="button" className="w-full cursor-pointer rounded-none px-3 py-2 text-left text-sm text-muted-foreground hover:bg-accent hover:text-accent-foreground" onMouseDown={(event) => event.preventDefault()} onClick={loadMore}>Load more</button>}
          </Combobox.Popup>
        </Combobox.Positioner>
      </Combobox.Portal>
    </Combobox.Root>
  );
}

export function ClearSelectionButton({ label, onClear }: { label: string; onClear: () => void }) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-xs"
      className="absolute right-7 top-1/2 z-10 -translate-y-1/2 text-muted-foreground hover:text-foreground"
      aria-label={`Clear ${label}`}
      title={`Clear ${label}`}
      onClick={(event) => { event.preventDefault(); event.stopPropagation(); onClear(); }}
    >
      <X aria-hidden="true" />
    </Button>
  );
}
