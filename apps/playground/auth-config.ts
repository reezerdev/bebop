export const defaultBetterAuthURL = "http://127.0.0.1:5173";

export function getBetterAuthURL(value?: string): string {
  const normalized = (value || defaultBetterAuthURL).replace(/\/+$/, "");
  let url: URL;

  try {
    url = new URL(normalized);
  } catch {
    throw new Error(`Invalid BETTER_AUTH_URL "${normalized}". Use an absolute http:// or https:// URL.`);
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error(`Invalid BETTER_AUTH_URL protocol "${url.protocol}". Use http:// or https://.`);
  }

  return normalized;
}
