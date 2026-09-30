import { useRowReadPermissions } from "../hooks/use-row-permissions.js";

import { useAll, useDb } from "jazz-tools/react";

import { Controller, Control, FieldValues, RegisterOptions, UseFormRegister } from "react-hook-form";
import { X } from "lucide-react";

import type { BebopAdminManifest, BebopAdminStoredField } from "../../../types.js";

import { Button } from "../../../components/ui/button.js";
import { Input } from "../../../components/ui/input.js";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../../components/ui/select.js";

import { Textarea } from "../../../components/ui/textarea.js";

import { UploadFieldInput } from "../../upload.js";
import type { BebopAdminClient, BebopAdminProps } from "../types.js";
import type { AdminRecord, AdminDatabase } from "../data-access.js";
import { getTable, getMutations } from "../data-access.js";

import { selectLabel, recordTitle } from "../record-values.js";

export function FieldInput({
  field,
  app,
  client,
  manifest,
  register,
  control,
  relationOptions,
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
      if (field.kind === "relation" && value && relationOptions?.[field.relationTo ?? ""] && !relationOptions[field.relationTo ?? ""].some((option) => option.id === value)) return `Select a valid ${field.label.toLocaleLowerCase()}.`;
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
  const registration = register(field.name, rules);
  if (field.kind === "json") {
    return <Textarea id={`field-${field.name}`} rows={7} className="font-mono text-xs" placeholder="{}" {...registration} />;
  }
  if (field.kind === "text" && field.admin?.input === "textarea") {
    return <Textarea id={`field-${field.name}`} rows={7} {...registration} />;
  }
  const type = field.kind === "date" ? field.admin?.date?.pickerAppearance === "dayAndTime" ? "datetime-local" : "date" : field.kind === "number" || field.kind === "integer" ? "number" : "text";
  return <Input id={`field-${field.name}`} type={type} step={field.kind === "integer" ? 1 : field.kind === "number" ? "any" : undefined} {...registration} />;
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
  disabled = false,
}: {
  field: BebopAdminStoredField;
  app: object;
  client: BebopAdminClient;
  manifest: BebopAdminManifest;
  value: string | null;
  onChange: (value: string | null) => void;
  onBlur: () => void;
  inputRef: (instance: HTMLButtonElement | null) => void;
  options?: readonly { id: string; name: string }[];
  disabled?: boolean;
}) {
  const relatedSlug = field.relationTo ?? "";
  const relatedTable = options ? undefined : getTable(app, relatedSlug);
  const query = options ? undefined : getMutations(client, relatedSlug)?.query();
  const { data, isLoading } = useAll<AdminRecord>(query);
  const db = useDb() as AdminDatabase;
  const readPermissions = useRowReadPermissions(db, relatedTable, data ?? []);
  const readableRelatedRows = (data ?? []).filter((row) => readPermissions[row.id] !== "denied");
  const targetCollection = manifest.collections[relatedSlug];
  const availableOptions = options ?? readableRelatedRows.map((row) => ({
    id: row.id,
    name: targetCollection ? recordTitle(targetCollection, row) ?? row.id : row.id,
  }));
  return (
    <Select value={value} onValueChange={onChange} disabled={disabled}>
      <div className="relative">
        <SelectTrigger id={`field-${field.name}`} ref={inputRef} onBlur={onBlur} className="w-full pr-14">
          <SelectValue placeholder={disabled ? "Assigned automatically when saved" : isLoading ? "Loading related records…" : `Select ${field.label.toLocaleLowerCase()}`}>
            {(selectedValue: string | null) => selectedValue
              ? availableOptions.find((option) => option.id === selectedValue)?.name ?? selectedValue
              : disabled ? "Assigned automatically when saved" : isLoading ? "Loading related records…" : `Select ${field.label.toLocaleLowerCase()}`}
          </SelectValue>
        </SelectTrigger>
        {!disabled && !field.required && value && <ClearSelectionButton label={field.label} onClear={() => { onChange(null); onBlur(); }} />}
      </div>
      <SelectContent>
        {availableOptions.map((option) => <SelectItem key={option.id} value={option.id}>{option.name}</SelectItem>)}
      </SelectContent>
    </Select>
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
