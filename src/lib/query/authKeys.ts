const userContextAll = ["auth", "user-context"] as const;

export const authQueryKeys = {
  userContextAll,
  userContext: (uid: string | null) => [...userContextAll, uid ?? "anon"] as const,
} as const;
