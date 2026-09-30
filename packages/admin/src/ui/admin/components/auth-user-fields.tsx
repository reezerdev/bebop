import { EditorField } from "./common.js";
import { ReactNode } from "react";

import { Controller, Control, FieldErrors, FieldPath, UseFormRegister } from "react-hook-form";

import type { BebopAdminCollection } from "../../../types.js";

import { Input } from "../../../components/ui/input.js";
import { Label } from "../../../components/ui/label.js";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../../components/ui/select.js";

import { humanize, selectLabel } from "../record-values.js";

import { AuthUserFormValues, authUserProfileFields } from "../auth-user-values.js";

export function AuthUserFields({ collection, register, control, errors, includePassword = false, passwordPanel, disabled = false }: {
  collection: BebopAdminCollection;
  register: UseFormRegister<AuthUserFormValues>;
  control: Control<AuthUserFormValues>;
  errors: FieldErrors<AuthUserFormValues>;
  includePassword?: boolean;
  passwordPanel?: ReactNode;
  disabled?: boolean;
}) {
  const roleField = collection.fields.find((field) => field.name === "role");
  const options = roleField?.kind === "select" && roleField.options?.length ? roleField.options : ["user", "admin"];
  const roleLabel = (value: string) => {
    const label = roleField?.kind === "select" ? selectLabel(roleField, value) : humanize(value);
    return label.charAt(0).toLocaleUpperCase() + label.slice(1);
  };
  const profileFields = authUserProfileFields(collection);

  return (
    <fieldset disabled={disabled} className="m-0 grid min-w-0 grid-cols-1 border-0 p-0 lg:grid-cols-[minmax(0,1fr)_minmax(260px,31%)]">
      <section aria-label="Email and password" className="col-span-1 mb-2 mt-7 flex min-w-0 flex-col gap-6 rounded-[3px] bg-card px-6 py-8 text-card-foreground ring-1 ring-foreground/5 sm:px-10 sm:py-10 lg:col-span-2">
        <EditorField error={errors.email?.message}>
          <Label htmlFor="bebop-user-email" className="text-[13px] font-normal normal-case tracking-normal">Email <span className="text-destructive">*</span></Label>
          <Input id="bebop-user-email" type="email" autoComplete="email" aria-invalid={Boolean(errors.email)} {...register("email", {
            required: "Enter an email address.",
            pattern: { value: /^[^\s@]+@[^\s@]+\.[^\s@]+$/, message: "Enter a valid email address." },
          })} />
        </EditorField>
        {passwordPanel}
        {includePassword && <EditorField error={errors.password?.message}>
          <Label htmlFor="bebop-user-password" className="text-[13px] font-normal normal-case tracking-normal">Password <span className="text-destructive">*</span></Label>
          <Input id="bebop-user-password" type="password" autoComplete="new-password" aria-invalid={Boolean(errors.password)} {...register("password", { required: "Enter an initial password." })} />
          <p className="text-xs text-muted-foreground">Better Auth hashes and stores this password; the admin UI does not keep a copy.</p>
        </EditorField>}
        <EditorField>
          <label htmlFor="bebop-user-email-verified" className="flex min-h-10 cursor-pointer items-center gap-2 text-[13px]">
            <input id="bebop-user-email-verified" type="checkbox" className="size-4 accent-primary" {...register("emailVerified")} />
            <span>Email verified</span>
          </label>
        </EditorField>
      </section>
      <div className="min-w-0 space-y-6 py-7 lg:pr-10">
        <EditorField error={errors.name?.message}>
          <Label htmlFor="bebop-user-name" className="text-[13px] font-normal normal-case tracking-normal">Name <span className="text-destructive">*</span></Label>
          <Input id="bebop-user-name" autoComplete="name" aria-invalid={Boolean(errors.name)} {...register("name", { required: "Enter a name." })} />
        </EditorField>
        {profileFields.map((field) => {
          const name = field.name as FieldPath<AuthUserFormValues>;
          const error = errors[name]?.message;
          const label = <>{field.label}{field.required && <> <span className="text-destructive">*</span></>}</>;
          if (field.kind === "select") {
            return <EditorField key={field.name} error={error}>
              <Label htmlFor={`bebop-user-${field.name}`} className="text-[13px] font-normal normal-case tracking-normal">{label}</Label>
              <Controller
                control={control}
                name={name}
                rules={field.required ? { required: `Select ${field.label.toLocaleLowerCase()}.` } : undefined}
                render={({ field: input }) => <Select value={String(input.value ?? "")} onValueChange={input.onChange}>
                  <SelectTrigger id={`bebop-user-${field.name}`} ref={input.ref} onBlur={input.onBlur} className="w-full">
                    <SelectValue placeholder={`Select ${field.label.toLocaleLowerCase()}`}>{(value: string | null) => value ? selectLabel(field, value) : `Select ${field.label.toLocaleLowerCase()}`}</SelectValue>
                  </SelectTrigger>
                  <SelectContent>{(field.options ?? []).map((option) => <SelectItem key={option} value={option}>{selectLabel(field, option)}</SelectItem>)}</SelectContent>
                </Select>}
              />
            </EditorField>;
          }
          if (field.kind === "boolean") {
            return <EditorField key={field.name} error={error}>
              <label htmlFor={`bebop-user-${field.name}`} className="flex min-h-10 cursor-pointer items-center gap-2 text-[13px]">
                <input id={`bebop-user-${field.name}`} type="checkbox" className="size-4 accent-primary" {...register(name, field.required ? { required: `Select ${field.label.toLocaleLowerCase()}.` } : undefined)} />
                <span>{label}</span>
              </label>
            </EditorField>;
          }
          return <EditorField key={field.name} error={error}>
            <Label htmlFor={`bebop-user-${field.name}`} className="text-[13px] font-normal normal-case tracking-normal">{label}</Label>
            <Input id={`bebop-user-${field.name}`} autoComplete={field.name === "image" ? "url" : "off"} aria-invalid={Boolean(error)} {...register(name, field.required ? { required: `Enter ${field.label.toLocaleLowerCase()}.` } : undefined)} />
          </EditorField>;
        })}
      </div>
      <aside className="min-w-0 space-y-6 border-t border-border py-7 lg:border-t-0 lg:border-l lg:pl-8" aria-label="Additional user information">
        <EditorField error={errors.role?.message}>
          <Label htmlFor="bebop-user-role" className="text-[13px] font-normal normal-case tracking-normal">Role <span className="text-destructive">*</span></Label>
          <Controller
            control={control}
            name="role"
            rules={{ required: "Select a role." }}
            render={({ field: input }) => <Select value={input.value || "user"} onValueChange={input.onChange}>
              <SelectTrigger id="bebop-user-role" ref={input.ref} onBlur={input.onBlur} className="w-full">
                <SelectValue placeholder="Select role">{(value: string | null) => roleLabel(value ?? input.value ?? "user")}</SelectValue>
              </SelectTrigger>
              <SelectContent>{options.map((option) => <SelectItem key={option} value={option}>{roleLabel(option)}</SelectItem>)}</SelectContent>
            </Select>}
          />
        </EditorField>
      </aside>
    </fieldset>
  );
}
