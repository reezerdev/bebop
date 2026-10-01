export function pageWithLookahead<T>(rows: readonly T[], pageSize: number): { rows: T[]; hasNextPage: boolean } {
  return {
    rows: rows.slice(0, pageSize),
    hasNextPage: rows.length > pageSize,
  };
}
