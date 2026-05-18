const COMBINING_MARKS_PATTERN = /[\u0300-\u036f]/g;

export function normalizeSearchText(value: string): string {
  return value.normalize("NFD").replace(COMBINING_MARKS_PATTERN, "").toLowerCase().trim();
}

export function normalizeSlugText(value: string): string {
  return normalizeSearchText(value)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
