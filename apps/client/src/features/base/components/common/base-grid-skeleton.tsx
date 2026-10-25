import { Skeleton } from "@mantine/core";

type Props = { rows?: number; columns?: number };

// Placeholder grid while a base loads (or an embed waits for its page id).
export function BaseGridSkeleton({ rows = 3, columns = 3 }: Props) {
  const line = (key: string, height: number) => (
    <div key={key} style={{ display: "flex", gap: 8, marginBottom: 8 }}>
      {Array.from({ length: columns }, (_, c) => (
        <Skeleton key={c} height={height} width={c === 0 ? 220 : 160} radius="sm" />
      ))}
    </div>
  );
  return (
    <div aria-busy="true" style={{ paddingTop: 8 }}>
      <Skeleton height={24} width={180} radius="sm" mb={12} />
      {line("header", 28)}
      {Array.from({ length: rows }, (_, r) => line(`row-${r}`, 30))}
    </div>
  );
}
