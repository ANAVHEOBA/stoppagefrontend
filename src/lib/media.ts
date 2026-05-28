export function normalizeOptionalMediaUrl(value: string | null | undefined): string | null {
  const normalized = value?.trim();

  if (!normalized) {
    return null;
  }

  const lowerCased = normalized.toLowerCase();

  if (lowerCased === "undefined" || lowerCased === "null") {
    return null;
  }

  return normalized;
}
