export type CourseInterestSnapshot = {
  status: "loading" | "ready" | "failed";
  values: Record<string, boolean>;
};

// One mounted account/page only. No module/global or shared server cache.
export function createCourseInterestBatch(
  read: () => Promise<Record<string, boolean>>,
  publish: (snapshot: CourseInterestSnapshot) => void,
) {
  let active = true;
  let flight: Promise<void> | null = null;
  let deadline: ReturnType<typeof setTimeout> | undefined;
  let values: Record<string, boolean> = {};
  const revisions = new Map<string, number>();
  let status: CourseInterestSnapshot["status"] = "loading";
  const emit = () => { if (active) publish({ status, values }); };
  return {
    load() {
      if (!active) return Promise.resolve();
      if (flight) return flight;
      const before = new Map(revisions);
      status = "loading"; emit();
      // A read can remain pending without rejecting (transport/auth interruption).
      // End the indicator without inferring an unsaved value or auto-retrying.
      const request = new Promise<Record<string, boolean>>((resolve, reject) => {
        deadline = setTimeout(() => reject(new Error("Course interest read timed out")), 12_000);
        void Promise.resolve().then(read).then(resolve, reject);
      });
      flight = request.then(result => {
        if (!active) return;
        const next = { ...result };
        for (const [key, revision] of revisions) {
          if (revision !== before.get(key) && Object.hasOwn(values, key)) next[key] = values[key];
        }
        values = next; status = "ready"; emit();
      }).catch(() => {
        if (active) { status = "failed"; emit(); }
      }).finally(() => { clearTimeout(deadline); deadline = undefined; flight = null; });
      return flight;
    },
    saved(key: string, saved: boolean) {
      if (!active) return;
      revisions.set(key, (revisions.get(key) ?? 0) + 1);
      values = { ...values, [key]: saved }; emit();
    },
    dispose() { active = false; clearTimeout(deadline); values = {}; revisions.clear(); },
  };
}
