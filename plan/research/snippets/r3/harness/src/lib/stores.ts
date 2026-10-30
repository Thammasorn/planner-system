// Harness stand-in for TanStack Query hooks (in the app: useQuery(['page-summary', id]) etc.).
import { useSyncExternalStore } from "react";

export type PageSummary =
  | { status: "loading" }
  | { status: "ok"; id: string; title: string; icon: string | null }
  | { status: "deleted" } // deleted OR not visible to viewer (404 semantics)
  | { status: "creating" };

type Listener = () => void;
const listeners = new Set<Listener>();
const pages = new Map<string, PageSummary>();
const users = new Map<string, { name: string } | null>();
let version = 0;

function emit() {
  version++;
  for (const l of listeners) l();
}
function subscribe(l: Listener) {
  listeners.add(l);
  return () => listeners.delete(l);
}

export const mockDb = {
  setPage(id: string, s: PageSummary) {
    pages.set(id, s);
    emit();
  },
  setUser(id: string, u: { name: string } | null) {
    users.set(id, u);
    emit();
  },
};

export function usePageSummary(pageId: string): PageSummary {
  useSyncExternalStore(subscribe, () => version);
  if (pageId === "") return { status: "creating" };
  return pages.get(pageId) ?? { status: "loading" };
}

export function useUserName(userId: string): string | null | undefined {
  useSyncExternalStore(subscribe, () => version);
  const u = users.get(userId);
  return u === undefined ? undefined : u === null ? null : u.name;
}
