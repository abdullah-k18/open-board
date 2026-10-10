"use client";

import dynamic from "next/dynamic";

const ChessTable = dynamic(
  () => import("@/components/chess-table").then((mod) => mod.ChessTable),
  {
    ssr: false,
    loading: () => (
      <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-3 px-4 py-8">
        <p className="text-xs font-semibold tracking-[0.2em] text-moss uppercase">One page</p>
        <h1 className="font-display text-4xl font-semibold text-ink">Open Board</h1>
        <p className="text-lg text-ink-soft">Setting up the board…</p>
      </main>
    ),
  },
);

export function ChessTableLoader() {
  return <ChessTable />;
}
