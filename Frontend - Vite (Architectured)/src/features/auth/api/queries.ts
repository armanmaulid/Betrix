import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../context/AuthContext";

export function useLoginMutation() {
  const queryClient = useQueryClient();
  const { login: contextLogin } = useAuth(); // We still bridge to context for now to set the local token

  return useMutation({
    mutationFn: async ({ email, password }: { email: string; password: string }) => {
      // For now, we wrap the existing context login to maintain compatibility
      // until the full Zustand migration is complete.
      await contextLogin(email, password);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["market"] });
      queryClient.invalidateQueries({ queryKey: ["chat"] });
    },
  });
}
