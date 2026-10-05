export function remoteChangeAction(input: {
  baseline: string | null;
  latest: string;
  dirty: boolean;
  conflict: boolean;
}): "unchanged" | "preserve-draft" | "reload-clean-form" {
  if (input.conflict || input.baseline === input.latest) return "unchanged";
  return input.dirty ? "preserve-draft" : "reload-clean-form";
}
