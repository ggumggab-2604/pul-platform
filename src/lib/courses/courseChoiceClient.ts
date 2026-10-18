"use client";
import { createClient } from "@/lib/supabase/client";
import { safeCourseNextAction } from "./courseNextClient";
import type { CourseChoice } from "./courseNext";

type Entry = { value?: CourseChoice; checkedAt?: number; pending?: boolean; failed?: boolean; busy?: boolean; uncertain?: boolean; message?: string; attempt?: { id: string; enabled: boolean } };
type Snapshot = { viewer: string | null | undefined; epoch: number; authFailed: boolean; entries: ReadonlyMap<string, Entry> };
const empty: Snapshot = { viewer: undefined, epoch: 0, authFailed: false, entries: new Map() };
const limit = 12_000, reuseLimit = 5 * 60_000;
function bounded<T>(request: Promise<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("timeout")), limit);
    request.then(resolve, reject).finally(() => clearTimeout(timer));
  });
}
function valid(value: CourseChoice, key: string) {
  return value?.course_key === key && [value.saved, value.subscribed, value.available].every(v => typeof v === "boolean");
}
// Browser lifetime only, shared by the existing controls. No disk/server cache.
export function createCourseChoiceClient() {
  let snapshot = empty, started = false, authRevision = 0;
  const listeners = new Set<() => void>(), revisions = new Map<string, number>(), flights = new Map<string, Promise<void>>();
  const watched = new Map<string, number>();
  const queued = new Map<string, { key: string; resolve: (value: CourseChoice | null) => void }[]>();
  const emit = () => listeners.forEach(fn => fn());
  const patch = (key: string, entry: Entry) => { snapshot = { ...snapshot, entries: new Map(snapshot.entries).set(key, entry) }; emit(); };
  const identify = (viewer: string | null) => {
    const changed = snapshot.viewer !== viewer;
    snapshot = { viewer, epoch: snapshot.epoch + (changed ? 1 : 0), authFailed: false, entries: changed ? new Map() : snapshot.entries };
    if (changed) { revisions.clear(); flights.clear(); }
    emit();
  };
  const current = (epoch: number, viewer: string | null | undefined) => snapshot.epoch === epoch && snapshot.viewer === viewer;
  function fetchChoice(key: string, viewer: string, epoch: number): Promise<CourseChoice | null> {
    const group = JSON.stringify([viewer, epoch]);
    return new Promise(resolve => {
      const pending = queued.get(group);
      if (pending) { pending.push({ key, resolve }); return; }
      const requests = [{ key, resolve }]; queued.set(group, requests);
      void Promise.resolve().then(async () => {
        queued.delete(group);
        for (let offset = 0; offset < requests.length; offset += 24) {
          const batch = requests.slice(offset, offset + 24);
          if (!current(epoch, viewer)) { batch.forEach(item => item.resolve(null)); continue; }
          const result = await safeCourseNextAction({ op: "choiceReads", courses: batch.map(item => item.key), viewer });
          batch.forEach(item => item.resolve(result.ok ? result.data?.[item.key] ?? null : null));
        }
      });
    });
  }
  async function verify() {
    const revision = ++authRevision;
    try {
      const { data, error } = await bounded(createClient().auth.getSession());
      if (revision !== authRevision) return;
      if (error) throw error;
      identify(data.session?.user.id ?? null);
    } catch { if (revision === authRevision) { snapshot = { ...snapshot, authFailed: true }; emit(); } }
  }
  function start() {
    if (started || typeof window === "undefined") return;
    started = true;
    createClient().auth.onAuthStateChange((event, session) => {
      // Failed initial getSession may emit INITIAL_SESSION(null) first.
      if (event === "INITIAL_SESSION") return;
      authRevision++; identify(session?.user.id ?? null);
    });
    window.addEventListener("pul-auth-signed-out", () => { authRevision++; identify(null); });
    window.addEventListener("focus", () => { void verify().then(() => { if (!snapshot.authFailed) for (const key of watched.keys()) void read(key); }); });
    void verify();
  }
  function read(key: string, message = "") {
    if (!snapshot.viewer || snapshot.authFailed || snapshot.entries.get(key)?.busy || snapshot.entries.get(key)?.uncertain) return Promise.resolve();
    if (flights.has(key)) return flights.get(key)!;
    const { viewer, epoch } = snapshot, revision = revisions.get(key) ?? 0, previous = snapshot.entries.get(key) ?? {};
    const value = previous.checkedAt && Date.now() - previous.checkedAt <= reuseLimit ? previous.value : undefined;
    patch(key, { ...previous, value, pending: true, failed: false, message });
    const flight = bounded(fetchChoice(key, viewer, epoch)).then(value => {
      if (!current(epoch, viewer) || revision !== (revisions.get(key) ?? 0)) return;
      if (!value || !valid(value, key)) throw new Error("read");
      patch(key, { value, checkedAt: Date.now(), pending: false, message });
    }).catch(() => {
      if (current(epoch, viewer) && revision === (revisions.get(key) ?? 0)) patch(key, { ...snapshot.entries.get(key), pending: false, failed: true });
    }).finally(() => { if (flights.get(key) === flight) flights.delete(key); });
    flights.set(key, flight); return flight;
  }
  async function choose(key: string, enabled: boolean) {
    const before = snapshot.entries.get(key);
    if (!snapshot.viewer || snapshot.authFailed || !before?.value || before.busy) return false;
    const { viewer, epoch } = snapshot, revision = (revisions.get(key) ?? 0) + 1;
    revisions.set(key, revision); flights.delete(key);
    const attempt = before.attempt ?? { id: crypto.randomUUID(), enabled };
    patch(key, { ...before, attempt, busy: true, pending: false, message: "" });
    try {
      const result = await bounded(safeCourseNextAction({ op: "choice", course: key, enabled: attempt.enabled, requestId: attempt.id, viewer }));
      if (!current(epoch, viewer) || revision !== revisions.get(key)) return false;
      if (result.ok && valid(result.data, key)) {
        patch(key, { value: result.data, checkedAt: Date.now(), message: "설정했습니다. 기존에 받은 쪽지는 그대로 유지됩니다." }); return true;
      }
      const uncertain = result.ok || !["PT409", "42501", "22023", "P0002"].includes(result.code);
      const message = result.ok ? "저장 결과를 확인하지 못했습니다. 같은 요청으로 다시 확인해 주세요." : result.message;
      patch(key, { ...snapshot.entries.get(key), busy: false, uncertain, attempt: uncertain ? attempt : undefined, message });
      // A definitive rejection ends exact-write recovery; confirm state with a read.
      if (!uncertain && current(epoch, viewer) && revision === revisions.get(key)) void read(key, message);
    } catch { if (current(epoch, viewer) && revision === revisions.get(key)) patch(key, { ...snapshot.entries.get(key), busy: false, uncertain: true, attempt, message: "저장 결과를 확인하지 못했습니다. 같은 요청으로 다시 확인해 주세요." }); }
    return false;
  }
  return {
    subscribe(fn: () => void) { listeners.add(fn); start(); return () => { listeners.delete(fn); }; },
    getSnapshot: () => snapshot, getServerSnapshot: () => empty,
    verify, read, choose,
    watch(key: string) {
      watched.set(key, (watched.get(key) ?? 0) + 1);
      // Strict Mode's abandoned effect never issues an extra request.
      let active = true;
      void Promise.resolve().then(() => { if (active) void read(key); });
      return () => { active = false; const count = (watched.get(key) ?? 1) - 1; if (count) watched.set(key, count); else watched.delete(key); };
    },
    // Cache age gates a new control's fallback, not a value already displayed.
    // An unresolved save keeps its confirmed value alongside the exact retry.
    visible(entry?: Entry, mountedAt = Date.now()) { return entry?.busy || entry?.uncertain || entry?.checkedAt && mountedAt - entry.checkedAt <= reuseLimit ? entry?.value : undefined; },
  };
}
export const courseChoices = createCourseChoiceClient();
