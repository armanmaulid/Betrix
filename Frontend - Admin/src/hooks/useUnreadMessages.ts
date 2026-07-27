import { useQuery } from "@tanstack/react-query";
import { messagesApi } from "../api/messages";

// Polled lightly (30s) so the sidebar badge stays reasonably fresh without
// hammering the inbox endpoint. limit:1 keeps the payload small — the
// endpoint's unreadCount reflects the account total regardless of the page
// size requested, same as it does inside MessagesPage.
export function useUnreadMessagesCount(): number {
  const { data } = useQuery({
    queryKey: ["messages-unread-count"],
    queryFn: () => messagesApi.getInbox({ limit: 1 }),
    refetchInterval: 30_000,
    staleTime: 15_000,
  });
  return data?.unreadCount ?? 0;
}
