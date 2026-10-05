import { ComponentPropsWithRef, ReactNode } from "react";

import { Link } from "react-router-dom";

import { Button } from "../../../components/ui/button.js";

export function PageTitle({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="mb-7 flex flex-wrap items-end justify-between gap-4">
      <div>
        {eyebrow && <p className="mb-2 text-xs font-semibold uppercase tracking-[0.14em] text-primary">{eyebrow}</p>}
        <h1 className="text-[32px] font-normal leading-tight tracking-tight">{title}</h1>
        {description && <p className="mt-2 max-w-2xl text-sm text-muted-foreground">{description}</p>}
      </div>
      {action}
    </div>
  );
}

export function SelectionCheckbox(props: ComponentPropsWithRef<"input">) {
  return <input {...props} type="checkbox" className="appearance-none inline-grid size-4 shrink-0 cursor-pointer place-content-center border border-input bg-transparent before:content-[''] before:h-1 before:w-[0.45rem] before:scale-0 before:-rotate-45 before:border-b-2 before:border-l-2 before:border-primary-foreground checked:border-primary checked:bg-primary checked:before:scale-100 indeterminate:border-primary indeterminate:bg-primary indeterminate:before:h-0 indeterminate:before:scale-100 indeterminate:before:rotate-0 indeterminate:before:border-l-0 indeterminate:before:border-b-0 indeterminate:before:border-t-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:cursor-not-allowed disabled:opacity-50" />;
}

export function EditorHeading({ title, action, modal = false }: { title: string; action?: ReactNode; modal?: boolean }) {
  return <div className={`flex min-h-20 items-center justify-between gap-4 border-b border-border pb-4 ${modal ? "px-6 pt-4 lg:px-11" : ""}`}><h1 className="min-w-0 truncate text-[32px] font-normal leading-tight tracking-tight" title={title}>{title}</h1>{action}</div>;
}

export function EditorMeta({ details, actions, modal = false }: { details: ReactNode; actions?: ReactNode; modal?: boolean }) {
  return (
    <div className={`flex min-h-14 flex-wrap items-center justify-between gap-3 border-b border-border py-3 ${modal ? "px-6 lg:px-11" : ""}`}>
      <div className="flex flex-wrap items-center gap-x-6 gap-y-1 text-[13px]">{details}</div>
      <div className="ml-auto flex items-center gap-2">{actions}</div>
    </div>
  );
}

export function EditorField({ children, error }: { children: ReactNode; error?: ReactNode }) {
  return (
    <div className="flex flex-col gap-2 [&_[data-slot=input]]:h-10 [&_[data-slot=input]]:w-full [&_[data-slot=input]]:border [&_[data-slot=input]]:border-input [&_[data-slot=input]]:bg-muted/50 [&_[data-slot=input]]:px-3 [&_[data-slot=input]]:py-2 [&_[data-slot=input]]:text-[13px] [&_[data-slot=select-trigger]]:h-10 [&_[data-slot=select-trigger]]:w-full [&_[data-slot=select-trigger]]:border [&_[data-slot=select-trigger]]:border-input [&_[data-slot=select-trigger]]:bg-muted/50 [&_[data-slot=select-trigger]]:px-3 [&_[data-slot=select-trigger]]:py-2 [&_[data-slot=select-trigger]]:text-[13px] [&_[data-slot=textarea]]:min-h-32 [&_[data-slot=textarea]]:w-full [&_[data-slot=textarea]]:border [&_[data-slot=textarea]]:border-input [&_[data-slot=textarea]]:bg-muted/50 [&_[data-slot=textarea]]:px-3 [&_[data-slot=textarea]]:py-2 [&_[data-slot=textarea]]:text-[13px]">
      {children}
      {error && <p className="text-xs text-destructive" role="alert">{error}</p>}
    </div>
  );
}

export function NotFoundPage({ message = "We couldn’t find the page you’re looking for." }: { message?: string }) {
  return (
    <div className="flex min-h-72 flex-col items-center justify-center text-center">
      <p className="text-sm font-medium">Page not found</p>
      <p className="mt-1 text-sm text-muted-foreground">{message}</p>
      <Button nativeButton={false} render={<Link to="/admin" />} variant="outline" className="mt-5">Back to overview</Button>
    </div>
  );
}
