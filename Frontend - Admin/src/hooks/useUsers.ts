import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  fetchUsers,
  fetchUserDetail,
  fetchUserChats,
  updateUser,
  deleteUser,
  resetUserPassword,
  type UsersListParams,
} from "../api/users";

export function useUsers(params: UsersListParams) {
  return useQuery({
    queryKey: ["users", params],
    queryFn: () => fetchUsers(params),
    placeholderData: (prev) => prev,
  });
}

export function useUserDetail(id: string | undefined) {
  return useQuery({
    queryKey: ["user-detail", id],
    queryFn: () => fetchUserDetail(id as string),
    enabled: !!id,
  });
}

export function useUserChats(id: string | undefined, page: number) {
  return useQuery({
    queryKey: ["user-chats", id, page],
    queryFn: () => fetchUserChats(id as string, { page, limit: 20 }),
    enabled: !!id,
  });
}

export function useUpdateUser(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (updates: { status?: string; isAdmin?: boolean }) => updateUser(id, updates),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["users"] });
      queryClient.invalidateQueries({ queryKey: ["user-detail", id] });
    },
  });
}

export function useDeleteUser() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteUser(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["users"] });
    },
  });
}

export function useResetPassword(id: string) {
  return useMutation({
    mutationFn: (sendEmail: boolean) => resetUserPassword(id, sendEmail),
  });
}

export interface BulkActionResult {
  total: number;
  succeeded: number;
  failed: number;
}

// Backend doesn't expose bulk endpoints, so we fan the request out per-id and
// let allSettled tell us which ones failed instead of aborting on the first
// error — a partial success is still useful to report back to the admin.
export function useBulkUpdateStatus() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ ids, status }: { ids: string[]; status: string }): Promise<BulkActionResult> => {
      const results = await Promise.allSettled(ids.map((id) => updateUser(id, { status })));
      const failed = results.filter((r) => r.status === "rejected").length;
      return { total: ids.length, succeeded: ids.length - failed, failed };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["users"] });
    },
  });
}

export function useBulkDeleteUsers() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (ids: string[]): Promise<BulkActionResult> => {
      const results = await Promise.allSettled(ids.map((id) => deleteUser(id)));
      const failed = results.filter((r) => r.status === "rejected").length;
      return { total: ids.length, succeeded: ids.length - failed, failed };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["users"] });
    },
  });
}
