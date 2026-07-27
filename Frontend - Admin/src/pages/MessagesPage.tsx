import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { messagesApi, Message } from "../api/messages";
import { getApiErrorMessage } from "../api/client";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import { useDebounce } from "../hooks/useDebounce";
import { DashboardLayout } from "../components/layout/DashboardLayout";
import { Card } from "../components/ui/Card";
import { Modal } from "../components/ui/Modal";
import { Pagination } from "../components/ui/Pagination";
import { Mail, MailOpen, Trash2, Send, Plus, Reply, X, Smile, Radio, MoreVertical } from "lucide-react";
import clsx from "clsx";

const commonEmojis = ['😀', '😂', '❤️', '👍', '🎉', '🔥', '✨', '💯', '👏', '🙏', '💪', '✅', '❌', '⚠️', '📌', '🚀'];

export function MessagesPage() {
  const { user: currentUser, isLoading: authLoading } = useAuth();
  const navigate = useNavigate();
  const { showToast } = useToast();
  const [tab, setTab] = useState<"inbox" | "sent">("inbox");
  const [cache, setCache] = useState<{
    inbox?: { messages: Message[]; unreadCount: number; total: number };
    sent?: { messages: Message[]; total: number };
  }>({});
  const [messages, setMessages] = useState<Message[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [limit] = useState(20);
  const [loading, setLoading] = useState(false);
  const [selectedMessage, setSelectedMessage] = useState<Message | null>(null);
  const [selectedThread, setSelectedThread] = useState<Message[] | null>(null);
  const [showCompose, setShowCompose] = useState(false);
  const [filterUnread, setFilterUnread] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [replyTo, setReplyTo] = useState<{ email: string; subject: string; replyToMessageId?: string } | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);
  const [openDropdown, setOpenDropdown] = useState<string | null>(null);
  const [markingAsRead, setMarkingAsRead] = useState<Set<string>>(new Set()); // Track messages being marked

  // The search <input> stays bound to `searchQuery` so typing feels
  // instant. Fetching (and the cache-bypass check below) uses the debounced
  // value, so we only hit the backend once the user pauses for 400ms.
  const debouncedSearchQuery = useDebounce(searchQuery, 400);

  // Single source of truth for fetching + updating state/cache. Used both for
  // the initial/tab-switch load (which may serve from cache) and for forced
  // refreshes after mutations (send/delete/mark-as-read), which always hit
  // the network so the UI reflects the latest server state.
  const fetchAndSetMessages = useCallback(
    async (isCancelled?: () => boolean) => {
      setLoading(true);
      try {
        const offset = (page - 1) * limit;
        if (tab === "inbox") {
          const data = await messagesApi.getInbox({
            limit,
            offset,
            unread: filterUnread,
            search: debouncedSearchQuery || undefined,
          });
          if (isCancelled?.()) return;
          setMessages(data.messages || []);
          setUnreadCount(data.unreadCount || 0);
          setTotal(data.total || 0);
          if (page === 1 && !filterUnread && !debouncedSearchQuery) {
            setCache((prev) => ({ ...prev, inbox: { messages: data.messages, unreadCount: data.unreadCount, total: data.total } }));
          }
        } else {
          const data = await messagesApi.getSent({ limit, offset, search: debouncedSearchQuery || undefined });
          if (isCancelled?.()) return;
          setMessages(data.messages || []);
          setTotal(data.total || 0);
          if (page === 1 && !debouncedSearchQuery) {
            setCache((prev) => ({ ...prev, sent: { messages: data.messages, total: data.total } }));
          }
        }
      } catch (err) {
        if (!isCancelled?.()) {
          setMessages([]);
          setTotal(0);
        }
      } finally {
        if (!isCancelled?.()) setLoading(false);
      }
    },
    [tab, page, filterUnread, limit, debouncedSearchQuery]
  );

  // Manual refresh after a mutation (send/delete/mark-as-read) — always
  // bypasses the cache-check below so the list reflects the latest state.
  const loadMessages = useCallback(() => fetchAndSetMessages(), [fetchAndSetMessages]);

  useEffect(() => {
    // Serve from cache on the very first render of a tab (page 1, no filters).
    const cacheKey = tab;
    if (page === 1 && !filterUnread && !debouncedSearchQuery && cache[cacheKey]) {
      const cached = cache[cacheKey]!;
      setMessages(cached.messages);
      setTotal(cached.total);
      if (tab === "inbox" && "unreadCount" in cached) {
        setUnreadCount(cached.unreadCount);
      }
      return;
    }

    let cancelled = false;
    fetchAndSetMessages(() => cancelled);
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, page, filterUnread, debouncedSearchQuery]);

  // Jump back to page 1 once the debounced search term actually settles —
  // not on every keystroke, which would otherwise thrash the page state
  // while the user is still typing.
  useEffect(() => {
    setPage(1);
  }, [debouncedSearchQuery]);

  // Group messages by sender for inbox, by recipient for sent
  const groupedMessages = useMemo(() => {
    const groups = new Map<string, Message[]>();

    messages.forEach((msg) => {
      const key = tab === "inbox" ? (msg.from?.email || "system") : (msg.to?.email || "unknown");

      if (!groups.has(key)) {
        groups.set(key, []);
      }
      groups.get(key)!.push(msg);
    });

    const sortByDate = (a: Message, b: Message) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();

    return Array.from(groups.entries())
      .map(([email, msgs]) => {
        const sorted = msgs.sort(sortByDate);
        const unreadForCurrentUser = msgs.filter((m) => !m.readAt && m.to?.id === currentUser?.id);

        return {
          email,
          messages: sorted,
          latestMessage: sorted[0],
          unreadCount: unreadForCurrentUser.length,
        };
      })
      .sort((a, b) => new Date(b.latestMessage.createdAt).getTime() - new Date(a.latestMessage.createdAt).getTime());
  }, [messages, tab, currentUser?.id]);

  const handleOpenMessage = async (msg: Message) => {
    if (msg.threadId) {
      try {
        const threadData = await messagesApi.getThread(msg.threadId);
        if (threadData && threadData.messages && threadData.messages.length > 0) {
          setSelectedThread(threadData.messages);

          if (tab === "inbox") {
            const unreadIds = threadData.messages
              .filter((m) => !m.readAt && !markingAsRead.has(m.id) && m.to?.id === currentUser?.id)
              .map((m) => m.id);

            if (unreadIds.length > 0) {
              setMarkingAsRead((prev) => new Set([...prev, ...unreadIds]));

              // Mark all unread messages in the thread concurrently instead of
              // sequentially — no reason to serialize independent requests.
              Promise.allSettled(
                unreadIds.map((id) =>
                  messagesApi.markAsRead(id).catch((err: any) => {
                    if (err?.response?.status === 404) {
                      setMarkingAsRead((prev) => {
                        const next = new Set(prev);
                        next.delete(id);
                        return next;
                      });
                    }
                  })
                )
              ).then(() => loadMessages());
            } else {
              loadMessages();
            }
          }
        } else {
          setSelectedThread([msg]);
        }
      } catch (err) {
        setSelectedThread([msg]);
      }
    } else {
      setSelectedThread([msg]);

      if (tab === "inbox" && !msg.readAt) {
        messagesApi
          .markAsRead(msg.id)
          .then(() => loadMessages())
          .catch(() => {});
      }
    }
  };

  const handleDelete = async (id: string) => {
    setDeleteTargetId(id);
    setShowDeleteConfirm(true);
  };

  const handleConfirmDelete = async () => {
    if (!deleteTargetId) return;

    setShowDeleteConfirm(false);

    try {
      await messagesApi.deleteMessage(deleteTargetId);
      loadMessages();
      setSelectedMessage(null);
      setSelectedThread(null);
      setDeleteTargetId(null);
      showToast("Pesan berhasil dihapus.", "success");
    } catch (err) {
      // Previously this failure was swallowed silently — the admin had no
      // idea the delete didn't go through. Surface it via toast instead.
      setDeleteTargetId(null);
      showToast(getApiErrorMessage(err, "Gagal menghapus pesan"), "error");
    }
  };

  return (
    <DashboardLayout title="Messages">
      {authLoading ? (
        <div className="flex items-center justify-center h-64">
          <p className="text-[var(--text-muted)]">Loading...</p>
        </div>
      ) : (
        <>
          <div className="mb-6 flex items-center justify-between gap-4">
            <div className="flex-1 max-w-md">
              <input
                type="text"
                placeholder="Search messages..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-4 py-2 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-[var(--accent)] focus:outline-none"
              />
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setShowCompose(true)}
                className="flex items-center gap-2 rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white hover:opacity-90"
              >
                <Plus size={16} />
                Compose
              </button>
              <button
                onClick={() => navigate("/broadcast")}
                className="flex items-center gap-2 rounded-lg border border-[var(--border)] px-4 py-2 text-sm font-medium hover:bg-[var(--surface-alt)]"
              >
                <Radio size={16} />
                Broadcast
              </button>
            </div>
          </div>

          <Card>
            <div className="border-b border-[var(--border)] px-6 py-4">
              <div className="flex items-center justify-between">
                <div className="flex gap-4">
                  <button
                    onClick={() => {
                      setTab("inbox");
                      setPage(1);
                    }}
                    className={clsx(
                      "pb-2 text-sm font-medium transition-colors border-b-2",
                      tab === "inbox"
                        ? "border-[var(--accent)] text-[var(--accent)]"
                        : "border-transparent text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                    )}
                  >
                    Inbox {unreadCount > 0 && `(${unreadCount})`}
                  </button>
                  <button
                    onClick={() => {
                      setTab("sent");
                      setPage(1);
                    }}
                    className={clsx(
                      "pb-2 text-sm font-medium transition-colors border-b-2",
                      tab === "sent"
                        ? "border-[var(--accent)] text-[var(--accent)]"
                        : "border-transparent text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                    )}
                  >
                    Sent
                  </button>
                </div>
                {tab === "inbox" && (
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={filterUnread}
                      onChange={(e) => {
                        setFilterUnread(e.target.checked);
                        setPage(1);
                      }}
                      className="rounded"
                    />
                    Unread only
                  </label>
                )}
              </div>
            </div>

            <div className="divide-y divide-[var(--border)]">
              {loading ? (
                <div className="px-6 py-12 text-center text-[var(--text-muted)]">Loading...</div>
              ) : groupedMessages.length === 0 ? (
                <div className="px-6 py-12 text-center text-[var(--text-muted)]">No messages</div>
              ) : (
                groupedMessages.map((group) => (
                  <div
                    key={group.email}
                    onClick={() => handleOpenMessage(group.latestMessage)}
                    className={clsx(
                      "flex cursor-pointer gap-4 px-6 py-5 transition-colors hover:bg-[var(--surface-alt)]",
                      group.unreadCount > 0 && "bg-[var(--accent-soft)]"
                    )}
                  >
                    <div className="flex-shrink-0 pt-1">
                      {group.unreadCount > 0 ? (
                        <Mail size={20} className="text-[var(--accent)]" />
                      ) : (
                        <MailOpen size={20} className="text-[var(--text-muted)]" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0 space-y-1.5">
                      <div className="flex items-start justify-between gap-4">
                        <div className={clsx("text-sm", group.unreadCount > 0 ? "font-semibold" : "font-medium")}>
                          {tab === "inbox" ? (group.latestMessage.from?.name || group.email) : (group.latestMessage.to?.name || group.email)}
                        </div>
                        <div className="flex items-center gap-2">
                          {group.unreadCount > 0 && (
                            <span className="rounded-full bg-[var(--accent)] px-2 py-0.5 text-xs font-medium text-white">
                              {group.unreadCount}
                            </span>
                          )}
                          <time className="text-xs text-[var(--text-muted)] whitespace-nowrap">
                            {new Date(group.latestMessage.createdAt).toLocaleDateString("id-ID", {
                              day: "numeric",
                              month: "short",
                            })}
                          </time>
                        </div>
                      </div>
                      <div className={clsx("text-sm", group.unreadCount > 0 ? "font-medium" : "text-[var(--text-muted)]")}>
                        {group.latestMessage.subject}
                      </div>
                      <p className="text-xs text-[var(--text-muted)] line-clamp-2">{group.latestMessage.body}</p>
                    </div>
                  </div>
                ))
              )}
            </div>

            {total > limit && (
              <div className="border-t border-[var(--border)] px-6 py-4">
                <Pagination
                  pagination={{
                    page,
                    limit,
                    total,
                    totalPages: Math.ceil(total / limit),
                  }}
                  onPageChange={setPage}
                />
              </div>
            )}
          </Card>

          {selectedThread && selectedThread.length > 0 ? (
            <ThreadModal
              key={selectedThread.map((m) => m.id).join("-")}
              thread={selectedThread}
              onClose={() => {
                setSelectedThread(null);
                setSelectedMessage(null);
                loadMessages();
              }}
              onReply={async () => {
                const msg = selectedThread[0];
                if (msg.threadId) {
                  try {
                    const threadData = await messagesApi.getThread(msg.threadId);
                    if (threadData && threadData.messages && threadData.messages.length > 0) {
                      setSelectedThread([...threadData.messages]);
                    }
                  } catch (err) {
                    // Keep showing the optimistic state if the reload fails.
                  }
                }
                loadMessages();
              }}
              currentUserId={currentUser?.id || ""}
              openDropdown={openDropdown}
              setOpenDropdown={setOpenDropdown}
              onDeleteMessage={handleDelete}
            />
          ) : selectedMessage ? (
            <MessageDetailModal
              message={selectedMessage}
              onClose={() => setSelectedMessage(null)}
              onDelete={handleDelete}
              onReply={(email, subject) => {
                setReplyTo({ email, subject, replyToMessageId: selectedMessage.id });
                setShowCompose(true);
              }}
            />
          ) : null}

          {showCompose && (
            <ComposeModal
              onClose={() => {
                setShowCompose(false);
                setReplyTo(null);
              }}
              onSent={() => {
                setShowCompose(false);
                setReplyTo(null);
                loadMessages();
              }}
              replyTo={replyTo}
            />
          )}

          {showDeleteConfirm && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
              <div className="w-full max-w-md rounded-xl border border-[var(--border)] bg-[var(--surface)] shadow-2xl">
                <div className="px-6 py-4 border-b border-[var(--border)]">
                  <h3 className="text-lg font-semibold text-[var(--text-primary)]">Delete Message</h3>
                </div>
                <div className="px-6 py-4">
                  <p className="text-sm text-[var(--text-primary)]">
                    Are you sure you want to delete this message? This action cannot be undone.
                  </p>
                </div>
                <div className="px-6 py-4 border-t border-[var(--border)] flex justify-end gap-3">
                  <button
                    onClick={() => {
                      setShowDeleteConfirm(false);
                      setDeleteTargetId(null);
                    }}
                    className="rounded-lg border border-[var(--border)] px-4 py-2 text-sm font-medium hover:bg-[var(--surface-alt)]"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleConfirmDelete}
                    className="rounded-lg bg-[var(--danger)] px-4 py-2 text-sm font-medium text-white hover:opacity-90"
                  >
                    Delete
                  </button>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </DashboardLayout>
  );
}

function ThreadModal({
  thread,
  onClose,
  onReply,
  currentUserId,
  openDropdown,
  setOpenDropdown,
  onDeleteMessage,
}: {
  thread: Message[];
  onClose: () => void;
  onReply: (email: string, subject: string, replyToMessageId: string) => void;
  currentUserId: string;
  openDropdown: string | null;
  setOpenDropdown: (id: string | null) => void;
  onDeleteMessage: (id: string) => void;
}) {
  const [replyBody, setReplyBody] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [messages, setMessages] = useState<Message[]>(thread);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Broadcast messages (from System) have no sender id and can't be replied to.
  const isBroadcast = thread.some((msg) => !msg.from?.id);

  const firstMessage = messages[0];
  const lastRealMessage = messages.filter((m) => !m.id.startsWith("temp-")).slice(-1)[0] || messages[0];
  const lastMessage = lastRealMessage;

  useEffect(() => {
    setMessages([...thread]);
  }, [thread]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  useEffect(() => {
    if (!sending && textareaRef.current) {
      textareaRef.current.focus();
    }
  }, [sending]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (showEmojiPicker && !target.closest(".emoji-picker-container")) {
        setShowEmojiPicker(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [showEmojiPicker]);

  if (!firstMessage) {
    return null;
  }

  const handleSendReply = async () => {
    const trimmedBody = replyBody.trim();
    if (!trimmedBody) {
      setError("Message cannot be empty");
      return;
    }

    const replyEmail = lastMessage.from?.id === currentUserId ? lastMessage.to?.email : lastMessage.from?.email;
    const replySubject = firstMessage.subject.startsWith("Re: ") ? firstMessage.subject : `Re: ${firstMessage.subject}`;

    if (!replyEmail) {
      setError("Cannot determine recipient");
      return;
    }

    const currentUserName = messages.find((m) => m.from?.id === currentUserId)?.from?.name || "You";
    const optimisticId = `temp-${Date.now()}`;
    const optimisticMessage: Message = {
      id: optimisticId,
      subject: replySubject,
      body: trimmedBody,
      readAt: null,
      createdAt: new Date().toISOString(),
      threadId: firstMessage.threadId,
      replyToMessageId: lastMessage.id,
      from: {
        id: currentUserId,
        email: "",
        name: currentUserName,
      },
      // `from.id` can be null (system/broadcast senders), but `to.id` can't —
      // narrow it explicitly instead of assigning `from` straight into `to`.
      to:
        lastMessage.from?.id === currentUserId
          ? lastMessage.to
          : lastMessage.from
            ? { id: lastMessage.from.id ?? "", email: lastMessage.from.email, name: lastMessage.from.name }
            : undefined,
    };

    setMessages((prev) => [...prev, optimisticMessage]);
    setReplyBody("");
    setSending(true);
    setError("");

    try {
      const response = await messagesApi.sendMessage({
        toEmail: replyEmail,
        subject: replySubject,
        body: trimmedBody,
        replyToMessageId: lastMessage.id,
      });

      // sendMessage resolves with { id, createdAt } directly (not nested
      // under `message`) — swap the optimistic id for the real one so later
      // actions (delete, reply-to) target the actual persisted message.
      setMessages((prev) =>
        prev.map((m) => (m.id === optimisticId ? { ...optimisticMessage, id: response.id || optimisticId } : m))
      );

      onReply(replyEmail, replySubject, lastMessage.id);
    } catch (err) {
      setError(getApiErrorMessage(err, "Send failed"));
      setMessages((prev) => prev.filter((m) => m.id !== optimisticId));
      setReplyBody(trimmedBody);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="flex flex-col h-[80vh] w-full max-w-4xl rounded-xl border border-[var(--border)] bg-[var(--surface)] shadow-2xl">
        <div className="flex items-center justify-between border-b border-[var(--border)] px-6 py-4">
          <div>
            <h3 className="text-lg font-semibold text-[var(--text-primary)]">{firstMessage.subject}</h3>
            <p className="text-sm text-[var(--text-muted)]">
              {thread.length} message{thread.length > 1 ? "s" : ""}
            </p>
          </div>
          <button onClick={onClose} className="rounded-lg p-2 text-[var(--text-muted)] hover:bg-[var(--surface-alt)] hover:text-[var(--text-primary)]">
            <X size={20} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-3">
          {messages.map((msg) => {
            const isCurrentUser = msg.from?.id && currentUserId && msg.from.id === currentUserId;
            return (
              <div key={msg.id} className={`flex ${isCurrentUser ? "justify-end" : "justify-start"} group`}>
                <div className="flex items-start gap-2">
                  {!isCurrentUser && <div className="w-8" />}
                  <div
                    className={`relative max-w-[75%] rounded-2xl px-4 py-3 shadow-sm ${
                      isCurrentUser
                        ? "bg-[var(--accent)] text-white rounded-br-sm"
                        : "bg-[var(--surface-alt)] text-[var(--text-primary)] rounded-bl-sm"
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-1.5">
                      <span className="text-xs font-semibold">{msg.from?.name || "System"}</span>
                      <span className={`text-xs ${isCurrentUser ? "text-white/60" : "text-[var(--text-muted)]"}`}>
                        {new Date(msg.createdAt).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })}
                      </span>
                    </div>
                    <p className="text-sm leading-relaxed whitespace-pre-wrap break-words">{msg.body}</p>
                  </div>
                  <div className="relative">
                    <button
                      onClick={() => setOpenDropdown(openDropdown === msg.id ? null : msg.id)}
                      className="opacity-0 group-hover:opacity-100 rounded p-1 hover:bg-[var(--surface-alt)] transition-opacity"
                      title="More options"
                    >
                      <MoreVertical size={16} className="text-[var(--text-muted)]" />
                    </button>
                    {openDropdown === msg.id && (
                      <>
                        <div className="fixed inset-0 z-40" onClick={() => setOpenDropdown(null)} />
                        <div className="absolute right-0 top-full mt-1 w-40 rounded-lg border border-[var(--border)] bg-[var(--surface)] shadow-xl z-50">
                          <button
                            onClick={() => {
                              setOpenDropdown(null);
                              onDeleteMessage(msg.id);
                            }}
                            className="flex w-full items-center gap-2 px-4 py-2 text-sm text-[var(--danger)] hover:bg-[var(--danger-soft)] rounded-lg"
                          >
                            <Trash2 size={14} />
                            Delete
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                  {isCurrentUser && <div className="w-8" />}
                </div>
              </div>
            );
          })}
          <div ref={chatEndRef} />
        </div>

        <div className="border-t border-[var(--border)] px-6 py-4">
          {error && <p className="text-sm text-[var(--danger)] mb-2">{error}</p>}
          <div className="flex gap-2 items-end">
            {!isBroadcast && (
              <div className="relative emoji-picker-container">
                <button
                  onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                  className="rounded-lg p-2.5 text-[var(--text-muted)] hover:bg-[var(--surface-alt)] hover:text-[var(--text-primary)] transition-colors"
                  type="button"
                  title="Add emoji"
                >
                  <Smile size={20} />
                </button>
                {showEmojiPicker && (
                  <div className="absolute bottom-full left-0 mb-2 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-2 shadow-2xl z-50 min-w-[280px]">
                    <div className="grid grid-cols-8 gap-1">
                      {commonEmojis.map((emoji) => (
                        <button
                          key={emoji}
                          onClick={() => {
                            setReplyBody((prev) => prev + emoji);
                            setShowEmojiPicker(false);
                            textareaRef.current?.focus();
                          }}
                          className="rounded p-2 text-xl hover:bg-[var(--surface-alt)] transition-colors"
                          type="button"
                          title={emoji}
                        >
                          {emoji}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {!isBroadcast && (
              <>
                <textarea
                  ref={textareaRef}
                  value={replyBody}
                  onChange={(e) => setReplyBody(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      handleSendReply();
                    }
                  }}
                  placeholder="Type your reply... (Enter to send, Shift+Enter for new line)"
                  rows={3}
                  className="flex-1 rounded-lg border border-[var(--border)] bg-[var(--surface-alt)] px-4 py-2 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-[var(--accent)] focus:outline-none resize-none"
                  disabled={sending}
                />
                <button
                  onClick={handleSendReply}
                  disabled={!replyBody.trim() || sending}
                  className="flex items-center gap-2 rounded-lg bg-[var(--accent)] px-5 py-2.5 text-sm font-medium text-white hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Send size={18} />
                  {sending ? "Sending..." : "Send"}
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function MessageDetailModal({
  message,
  onClose,
  onDelete,
  onReply,
}: {
  message: Message;
  onClose: () => void;
  onDelete: (id: string) => void;
  onReply: (email: string, subject: string) => void;
}) {
  return (
    <Modal isOpen onClose={onClose} title={message.subject}>
      <div className="space-y-4">
        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-[var(--text-muted)]">From:</span>
            <span className="font-medium">
              {message.from.name} ({message.from.email})
            </span>
          </div>
          {message.to && (
            <div className="flex justify-between">
              <span className="text-[var(--text-muted)]">To:</span>
              <span className="font-medium">
                {message.to.name} ({message.to.email})
              </span>
            </div>
          )}
          <div className="flex justify-between">
            <span className="text-[var(--text-muted)]">Date:</span>
            <span>{new Date(message.createdAt).toLocaleString()}</span>
          </div>
        </div>

        <div className="border-t border-[var(--border)] pt-4">
          <div className="whitespace-pre-wrap text-sm">{message.body}</div>
        </div>

        <div className="flex justify-end gap-2 border-t border-[var(--border)] pt-4">
          <button
            onClick={() => {
              const replyEmail = message.from.email;
              const replySubject = message.subject.startsWith("Re: ") ? message.subject : `Re: ${message.subject}`;
              onReply(replyEmail, replySubject);
              onClose();
            }}
            className="flex items-center gap-2 rounded-lg border border-[var(--accent)] px-4 py-2 text-sm font-medium text-[var(--accent)] hover:bg-[var(--accent-soft)]"
          >
            <Reply size={16} />
            Reply
          </button>
          <button
            onClick={() => onDelete(message.id)}
            className="flex items-center gap-2 rounded-lg border border-[var(--danger)] px-4 py-2 text-sm font-medium text-[var(--danger)] hover:bg-[var(--danger-soft)]"
          >
            <Trash2 size={16} />
            Delete
          </button>
          <button
            onClick={onClose}
            className="rounded-lg border border-[var(--border)] px-4 py-2 text-sm font-medium hover:bg-[var(--surface-alt)]"
          >
            Close
          </button>
        </div>
      </div>
    </Modal>
  );
}

function ComposeModal({
  onClose,
  onSent,
  replyTo,
}: {
  onClose: () => void;
  onSent: () => void;
  replyTo?: { email: string; subject: string; replyToMessageId?: string } | null;
}) {
  const { showToast } = useToast();
  const [toEmail, setToEmail] = useState(replyTo?.email || "");
  const [subject, setSubject] = useState(replyTo?.subject || "");
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");

  const handleSend = async () => {
    if (!toEmail.trim() || !subject.trim() || !body.trim()) {
      setError("All fields required");
      return;
    }

    setSending(true);
    setError("");
    try {
      await messagesApi.sendMessage({
        toEmail,
        subject,
        body,
        replyToMessageId: replyTo?.replyToMessageId,
      });
      showToast(replyTo ? "Balasan terkirim." : "Pesan terkirim.", "success");
      onSent();
    } catch (err) {
      setError(getApiErrorMessage(err, "Send failed"));
    } finally {
      setSending(false);
    }
  };

  return (
    <Modal isOpen onClose={onClose} title="Compose Message">
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium mb-1">Recipient Email</label>
          <input
            type="email"
            value={toEmail}
            onChange={(e) => setToEmail(e.target.value)}
            className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm"
            placeholder="user@example.com"
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Subject</label>
          <input
            type="text"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm"
            placeholder="Message subject"
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Message</label>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={6}
            className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm"
            placeholder="Type your message..."
          />
        </div>

        {error && (
          <div className="rounded-lg bg-[var(--danger-soft)] px-4 py-2 text-sm text-[var(--danger)]">{error}</div>
        )}

        <div className="flex justify-end gap-2">
          <button
            onClick={onClose}
            disabled={sending}
            className="rounded-lg border border-[var(--border)] px-4 py-2 text-sm font-medium hover:bg-[var(--surface-alt)] disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleSend}
            disabled={sending}
            className="flex items-center gap-2 rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
          >
            <Send size={16} />
            {sending ? "Sending..." : "Send"}
          </button>
        </div>
      </div>
    </Modal>
  );
}
