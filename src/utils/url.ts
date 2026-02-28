/**
 * Join base URL and path with a single slash.
 */
export const joinUrl = (base: string, path: string) => `${base.replace(/\/$/, '')}${path}`;
