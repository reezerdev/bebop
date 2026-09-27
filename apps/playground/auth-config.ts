export const defaultBetterAuthURL = "http://127.0.0.1:5173";

export function getBetterAuthURL(value?: string): string {
  return (value || defaultBetterAuthURL).replace(/\/+$/, "");
}
