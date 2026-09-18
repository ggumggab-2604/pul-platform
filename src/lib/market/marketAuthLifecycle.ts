type AuthClient = {
  getUser(): Promise<{ data: { user: { id: string } | null }; error: unknown }>;
  onAuthStateChange(
    callback: (event: string, session: { user: { id: string } } | null) => void,
  ): {
    data: { subscription: { unsubscribe(): void } };
  };
};

/** Cookie sessions may change in another tab without a local auth callback. */
export function observeMarketIdentity(
  auth: AuthClient,
  onIdentity: (id: string | null) => void,
  clearSensitiveDetails: () => void,
) {
  let revision = 0;
  let disposed = false;
  const { data } = auth.onAuthStateChange((_event, session) => {
    revision += 1;
    if (!disposed) onIdentity(session?.user.id ?? null);
  });
  const verify = async () => {
    const ticket = ++revision;
    try {
      const result = await auth.getUser();
      if (disposed || ticket !== revision) return;
      if (result.error) {
        // Cookie deletion in another tab returns an error, rather than a
        // successful { user: null }. Invalidate the previous identity too.
        const error = result.error as { name?: string; status?: number };
        if (
          error.name === "AuthSessionMissingError" ||
          error.status === 401 ||
          error.status === 403
        )
          onIdentity(null);
        else clearSensitiveDetails();
      } else onIdentity(result.data.user?.id ?? null);
    } catch {
      if (!disposed && ticket === revision) clearSensitiveDetails();
    }
  };
  const visibility = () => {
    if (document.visibilityState === "hidden") clearSensitiveDetails();
    else void verify();
  };
  window.addEventListener("focus", verify);
  document.addEventListener("visibilitychange", visibility);
  return () => {
    disposed = true;
    revision += 1;
    data.subscription.unsubscribe();
    window.removeEventListener("focus", verify);
    document.removeEventListener("visibilitychange", visibility);
  };
}
