import { PageTitle, EditorHeading, EditorMeta, EditorField } from "../components/common.js";
import { AuthUserFields } from "../components/auth-user-fields.js";
import { useState, useEffect } from "react";

import { useForm } from "react-hook-form";

import { useNavigate, useOutletContext } from "react-router-dom";
import type { BebopAdminCollection, BebopAdminStoredField } from "../../../types.js";

import { Button } from "../../../components/ui/button.js";
import { Input } from "../../../components/ui/input.js";
import { Label } from "../../../components/ui/label.js";

import { useToastManager } from "../../../components/ui/toast.js";

import type { BebopAdminProps, AdminOutletContext, BebopAdminClient } from "../types.js";

import { formatDate } from "../record-values.js";

import { AuthUserFormValues, authUserFormDefaults, authUserProfileData, primaryAuthRole } from "../auth-user-values.js";

type UploadMutationClient = {
  create: (data: Record<string, unknown>) => Promise<{ doc?: { id?: string } }>;
};

async function uploadUserImage(client: BebopAdminClient, field: BebopAdminStoredField, file: File): Promise<string> {
  const collectionSlug = field.relationTo ?? "";
  const mutations = (client as Record<string, unknown>)[collectionSlug] as UploadMutationClient | undefined;
  if (!mutations?.create) throw new Error(`The Bebop mutation client is missing the "${collectionSlug}" upload collection.`);
  const result = await mutations.create({ file });
  if (!result.doc?.id) throw new Error("The uploaded image did not return a media document ID.");
  return result.doc.id;
}

export function AuthUserCreate({ collection, client, manifest, authClient, canManageUsers }: {
  collection: BebopAdminCollection;
  client: BebopAdminProps["client"];
  manifest: BebopAdminProps["manifest"];
  authClient?: BebopAdminProps["authClient"];
  canManageUsers: boolean;
}) {
  const navigate = useNavigate();
  const toast = useToastManager();
  const [saveError, setSaveError] = useState<string>();
  const [pendingImage, setPendingImage] = useState<File>();
  const { register, control, handleSubmit, setValue, formState: { errors, isSubmitting } } = useForm<AuthUserFormValues>({
    defaultValues: authUserFormDefaults(collection),
  });

  if (!canManageUsers) {
    return <section><PageTitle title={`Create ${collection.labels.singular}`} /><p role="alert" className="border border-border px-4 py-3 text-sm text-muted-foreground">Only a Better Auth administrator can create users.</p></section>;
  }
  if (!authClient) {
    return <section><PageTitle title={`Create ${collection.labels.singular}`} /><p role="alert" className="border border-border px-4 py-3 text-sm text-muted-foreground">Pass a Better Auth client configured with adminClient() to enable user management.</p></section>;
  }

  const onSubmit = handleSubmit(async (values) => {
    setSaveError(undefined);
    try {
      const imageField = collection.fields.find((field): field is BebopAdminStoredField => field.name === "image" && field.kind === "upload");
      let submittedValues = values;
      if (pendingImage && imageField) {
        const imageId = await uploadUserImage(client, imageField, pendingImage);
        setValue(imageField.name, imageId, { shouldDirty: true });
        submittedValues = { ...values, [imageField.name]: imageId };
        setPendingImage(undefined);
      }
      const response = await authClient.admin.createUser({
        name: submittedValues.name.trim(),
        email: submittedValues.email.trim(),
        password: submittedValues.password,
        role: primaryAuthRole(submittedValues.role),
        data: { emailVerified: submittedValues.emailVerified, ...authUserProfileData(collection, submittedValues) },
      });
      if (response.error || !response.data?.user) {
        throw new Error(response.error?.message || "Better Auth did not return the created user.");
      }
      toast.add({ type: "success", title: `${collection.labels.singular} created`, description: "The account was created through Better Auth." });
      navigate(`/admin/collections/${collection.slug}`);
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : `Could not create ${collection.labels.singular.toLocaleLowerCase()}.`;
      setSaveError(message);
      toast.add({ type: "error", title: `Could not create ${collection.labels.singular.toLocaleLowerCase()}`, description: message });
    }
  });

  return (
    <div>
      <EditorHeading title={`New ${collection.labels.singular}`} />
      <form onSubmit={onSubmit} noValidate>
        <EditorMeta
          details={<span className="text-muted-foreground">New document</span>}
          actions={<>
            <Button variant="secondary" size="sm" type="submit" className="normal-case tracking-normal" disabled={isSubmitting}>{isSubmitting ? "Creating…" : "Create"}</Button>
            <Button variant="outline" size="sm" type="button" className="normal-case tracking-normal" disabled={isSubmitting} onClick={() => navigate(`/admin/collections/${collection.slug}`)}>Cancel</Button>
          </>}
        />
        {saveError && <p role="alert" className="border-b border-border py-3 text-[13px] text-destructive">{saveError}</p>}
        <AuthUserFields collection={collection} register={register} control={control} errors={errors} client={client} manifest={manifest} pendingImage={pendingImage} onPendingImageChange={setPendingImage} includePassword disabled={isSubmitting} />
      </form>
    </div>
  );
}

export function AuthUserEditor({ collection, client, manifest, authClient, canManageUsers, id }: {
  collection: BebopAdminCollection;
  client: BebopAdminProps["client"];
  manifest: BebopAdminProps["manifest"];
  authClient?: BebopAdminProps["authClient"];
  canManageUsers: boolean;
  id: string;
}) {
  const navigate = useNavigate();
  const toast = useToastManager();
  const { setDocumentBreadcrumb } = useOutletContext<AdminOutletContext>();
  const [user, setUser] = useState<(Record<string, unknown> & { id: string })>();
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string>();
  const [saveError, setSaveError] = useState<string>();
  const [changingPassword, setChangingPassword] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [pendingImage, setPendingImage] = useState<File>();
  const { register, control, handleSubmit, reset, setValue, formState: { errors, isSubmitting, isDirty } } = useForm<AuthUserFormValues>({
    defaultValues: authUserFormDefaults(collection),
  });

  useEffect(() => {
    if (!canManageUsers || !authClient) return;
    let active = true;
    setLoading(true);
    setLoadError(undefined);
    void authClient.admin.getUser({ query: { id } }).then((response) => {
      if (!active) return;
      if (response.error || !response.data) {
        setLoadError(response.error?.message || "Better Auth did not return this user.");
        setUser(undefined);
        return;
      }
      const loadedUser = response.data;
      setUser(loadedUser);
      reset(authUserFormDefaults(collection, loadedUser));
    }).catch((caught: unknown) => {
      if (!active) return;
      setLoadError(caught instanceof Error ? caught.message : "Better Auth could not load this user.");
      setUser(undefined);
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, [authClient, canManageUsers, collection, id, reset]);

  const title = user?.name ? String(user.name) : user?.email ? String(user.email) : id;
  useEffect(() => {
    setDocumentBreadcrumb(user ? title : undefined);
    return () => setDocumentBreadcrumb(undefined);
  }, [setDocumentBreadcrumb, title, user]);

  if (!canManageUsers) {
    return <section><PageTitle title={collection.labels.singular} /><p role="alert" className="border border-border px-4 py-3 text-sm text-muted-foreground">Only a Better Auth administrator can view registered users.</p></section>;
  }
  if (!authClient) {
    return <section><PageTitle title={collection.labels.singular} /><p role="alert" className="border border-border px-4 py-3 text-sm text-muted-foreground">Pass a Better Auth client configured with adminClient() to enable user management.</p></section>;
  }

  const onSubmit = handleSubmit(async (values) => {
    if (!user) return;
    setSaveError(undefined);
    if (changingPassword && !newPassword) {
      setSaveError("Enter a new password.");
      return;
    }
    if (changingPassword && newPassword !== confirmPassword) {
      setSaveError("Passwords do not match.");
      return;
    }
    try {
      let submittedValues = values;
      const imageField = collection.fields.find((field): field is BebopAdminStoredField => field.name === "image" && field.kind === "upload");
      if (pendingImage && imageField) {
        const imageId = await uploadUserImage(client, imageField, pendingImage);
        setValue(imageField.name, imageId, { shouldDirty: true });
        submittedValues = { ...values, [imageField.name]: imageId };
        setPendingImage(undefined);
      }
      const data: Record<string, unknown> = {};
      Object.assign(data, authUserProfileData(collection, submittedValues, user));
      const normalizedName = submittedValues.name.trim();
      const normalizedEmail = submittedValues.email.trim();
      const normalizedRole = primaryAuthRole(submittedValues.role);
      if (normalizedName !== String(user.name ?? "")) data.name = normalizedName;
      if (normalizedEmail !== String(user.email ?? "")) data.email = normalizedEmail;
      if (normalizedRole !== primaryAuthRole(user.role)) data.role = normalizedRole;
      if (submittedValues.emailVerified !== (user.emailVerified === true)) data.emailVerified = submittedValues.emailVerified;
      if (!Object.keys(data).length && !changingPassword) {
        reset(authUserFormDefaults(collection, user));
        return;
      }
      let updatedUser = user;
      let profileUpdated = false;
      if (Object.keys(data).length) {
        const response = await authClient.admin.updateUser({ userId: id, data });
        if (response.error || !response.data) {
          throw new Error(response.error?.message || "Better Auth did not return the updated user.");
        }
        updatedUser = response.data;
        profileUpdated = true;
        setUser(updatedUser);
        reset(authUserFormDefaults(collection, updatedUser));
      }
      if (changingPassword) {
        const response = await authClient.admin.setUserPassword({ userId: id, newPassword });
        if (response.error || !response.data?.status) {
          const reason = response.error?.message || "Better Auth did not confirm the password change.";
          throw new Error(profileUpdated ? `Profile changes were saved, but the password could not be changed: ${reason}` : reason);
        }
      }
      if (!profileUpdated) setUser(updatedUser);
      reset(authUserFormDefaults(collection, updatedUser));
      setChangingPassword(false);
      setNewPassword("");
      setConfirmPassword("");
      toast.add({
        type: "success",
        title: `${collection.labels.singular} updated`,
        description: changingPassword ? "Account changes and password were saved." : "Better Auth saved the account changes.",
      });
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : `Could not update ${collection.labels.singular.toLocaleLowerCase()}.`;
      setSaveError(message);
      toast.add({ type: "error", title: `Could not update ${collection.labels.singular.toLocaleLowerCase()}`, description: message });
    }
  });

  if (loading) return (
    <div>
      <EditorHeading title={collection.labels.singular} />
      <p className="border-b border-border py-3 text-[13px] text-muted-foreground" role="status">Loading user…</p>
    </div>
  );
  if (loadError || !user) return (
    <div>
      <EditorHeading title={collection.labels.singular} />
      <EditorMeta
        details={<span className="text-muted-foreground">Could not load this user.</span>}
        actions={
          <Button variant="outline" size="sm" className="normal-case tracking-normal" onClick={() => navigate(`/admin/collections/${collection.slug}`)}>Back to Users</Button>
        }
      />
      <p role="alert" className="border-b border-border py-3 text-[13px] text-destructive">{loadError ?? "User not found."}</p>
    </div>
  );

  return (
    <div>
      <EditorHeading title={title} />
      <form onSubmit={onSubmit} noValidate>
        <EditorMeta
          details={
            <>
              <span><span className="text-muted-foreground">Last Modified: </span>{formatDate(user.updatedAt, true)}</span>
              <span><span className="text-muted-foreground">Created: </span>{formatDate(user.createdAt, true)}</span>
            </>
          }
          actions={
            <>
              <Button variant="secondary" size="sm" type="submit" className="normal-case tracking-normal" disabled={(!isDirty && !pendingImage && !(changingPassword && (newPassword.length > 0 || confirmPassword.length > 0))) || isSubmitting}>{isSubmitting ? "Saving…" : "Save"}</Button>
              <Button variant="outline" size="sm" type="button" className="normal-case tracking-normal" disabled={isSubmitting} onClick={() => navigate(`/admin/collections/${collection.slug}`)}>Cancel</Button>
            </>
          }
        />
        {saveError && <p role="alert" className="border-b border-border py-3 text-[13px] text-destructive">{saveError}</p>}
        <AuthUserFields
          collection={collection}
          register={register}
          control={control}
          errors={errors}
          client={client}
          manifest={manifest}
          pendingImage={pendingImage}
          onPendingImageChange={setPendingImage}
          disabled={isSubmitting}
          passwordPanel={changingPassword ? <>
            <EditorField>
              <Label htmlFor="bebop-user-new-password" className="text-[13px] font-normal normal-case tracking-normal">New Password <span className="text-destructive">*</span></Label>
              <Input id="bebop-user-new-password" type="password" autoComplete="new-password" aria-required="true" value={newPassword} onChange={(event) => setNewPassword(event.currentTarget.value)} />
            </EditorField>
            <EditorField>
              <Label htmlFor="bebop-user-confirm-password" className="text-[13px] font-normal normal-case tracking-normal">Confirm Password <span className="text-destructive">*</span></Label>
              <Input id="bebop-user-confirm-password" type="password" autoComplete="new-password" aria-required="true" value={confirmPassword} onChange={(event) => setConfirmPassword(event.currentTarget.value)} />
            </EditorField>
            <div>
              <Button variant="outline" size="sm" type="button" className="normal-case tracking-normal" onClick={() => {
                setChangingPassword(false);
                setNewPassword("");
                setConfirmPassword("");
                setSaveError(undefined);
              }}>Cancel</Button>
            </div>
          </> : <div>
            <Button variant="outline" size="sm" type="button" className="normal-case tracking-normal" onClick={() => {
              setChangingPassword(true);
              setSaveError(undefined);
            }}>Change Password</Button>
          </div>}
        />
      </form>
    </div>
  );
}
