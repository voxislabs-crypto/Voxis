import { useCallback } from "react";
import { useAuth } from "@clerk/react";

export function useAuthFetch() {
  const { getToken } = useAuth();

  return useCallback(
    async (url, options = {}) => {
      const token = await getToken();
      return fetch(url, {
        ...options,
        headers: {
          ...(options.headers || {}),
          Authorization: `Bearer ${token}`,
        },
      });
    },
    [getToken],
  );
}
