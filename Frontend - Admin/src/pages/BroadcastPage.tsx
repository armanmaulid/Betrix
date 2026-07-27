import { useState } from "react";
import { DashboardLayout } from "../components/layout/DashboardLayout";
import { Card } from "../components/ui/Card";
import { sendBroadcast } from "../api/broadcast";
import { getApiErrorMessage } from "../api/client";
import { useToast } from "../context/ToastContext";
import { Send, Users, Loader2 } from "lucide-react";

export function BroadcastPage() {
  const { showToast } = useToast();
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [recipients, setRecipients] = useState<"all" | "ids" | "emails">("all");
  const [userIds, setUserIds] = useState("");
  const [userEmails, setUserEmails] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [showConfirm, setShowConfirm] = useState(false);
  const [confirmMessage, setConfirmMessage] = useState("");

  const handleSend = () => {
    setError("");

    if (!subject.trim()) {
      setError("Subject is required");
      return;
    }

    if (!body.trim()) {
      setError("Message body is required");
      return;
    }

    if (subject.length > 200) {
      setError("Subject too long (max 200 characters)");
      return;
    }

    if (recipients === "ids" && !userIds.trim()) {
      setError("Enter at least one user ID");
      return;
    }

    if (recipients === "emails" && !userEmails.trim()) {
      setError("Enter at least one email address");
      return;
    }

    let recipientPayload: "all" | string[] = "all";
    let recipientCount = 0;

    if (recipients === "ids") {
      recipientPayload = userIds
        .split(",")
        .map((id) => id.trim())
        .filter(Boolean);

      if (recipientPayload.length === 0) {
        setError("No valid user IDs provided");
        return;
      }
      recipientCount = recipientPayload.length;
    } else if (recipients === "emails") {
      recipientPayload = userEmails
        .split(",")
        .map((email) => email.trim())
        .filter(Boolean);

      if (recipientPayload.length === 0) {
        setError("No valid email addresses provided");
        return;
      }
      recipientCount = recipientPayload.length;
    }

    const message =
      recipients === "all"
        ? "Send this message to ALL active users?"
        : `Send this message to ${recipientCount} user(s)?`;

    setConfirmMessage(message);
    setShowConfirm(true);
  };

  const handleConfirmSend = async () => {
    setShowConfirm(false);
    setSending(true);

    let recipientPayload: "all" | string[] = "all";

    if (recipients === "ids") {
      recipientPayload = userIds
        .split(",")
        .map((id) => id.trim())
        .filter(Boolean);
    } else if (recipients === "emails") {
      recipientPayload = userEmails
        .split(",")
        .map((email) => email.trim())
        .filter(Boolean);
    }

    try {
      const result = await sendBroadcast({
        subject,
        body,
        recipients: recipientPayload,
      });

      // Success feedback moved to a toast (matches EditUserModal's pattern:
      // transient success -> toast, blocking error -> stays inline so the
      // admin can see it and retry without it auto-dismissing).
      showToast(
        `Message sent successfully to ${result.recipientCount} user(s). ${result.emailsSent} email(s) delivered.`,
        "success"
      );
      setSubject("");
      setBody("");
      setUserIds("");
      setUserEmails("");
    } catch (err) {
      setError(getApiErrorMessage(err, "Failed to send broadcast"));
    } finally {
      setSending(false);
    }
  };

  const handleClear = () => {
    setSubject("");
    setBody("");
    setUserIds("");
    setUserEmails("");
    setError("");
  };

  return (
    <DashboardLayout title="Broadcast Message">
      <Card>
        <div className="p-6 space-y-6">
          <div className="flex items-start gap-3 p-4 rounded-lg bg-[var(--accent-soft)] border border-[var(--border)]">
            <Users className="text-[var(--accent)] flex-shrink-0 mt-0.5" size={20} />
            <div className="text-sm text-[var(--text-primary)]">
              <p className="font-medium mb-1">Broadcast Message</p>
              <p className="text-[var(--text-muted)]">
                Send announcements or notifications to users. Messages appear in their inbox and
                optionally via email.
              </p>
            </div>
          </div>

          {error && (
            <div className="p-4 rounded-lg bg-[var(--danger-soft)] border border-[var(--danger)]/30 text-sm text-[var(--danger)]">
              {error}
            </div>
          )}

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-[var(--text-primary)] mb-2">
                Recipients
              </label>
              <div className="space-y-2">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    checked={recipients === "all"}
                    onChange={() => setRecipients("all")}
                    className="rounded-full"
                  />
                  <span className="text-sm">All active users</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    checked={recipients === "ids"}
                    onChange={() => setRecipients("ids")}
                    className="rounded-full"
                  />
                  <span className="text-sm">Specific users (by ID)</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    checked={recipients === "emails"}
                    onChange={() => setRecipients("emails")}
                    className="rounded-full"
                  />
                  <span className="text-sm">Specific users (by email)</span>
                </label>
              </div>
            </div>

            {recipients === "ids" && (
              <div>
                <label className="block text-sm font-medium text-[var(--text-primary)] mb-2">
                  User IDs (comma-separated)
                </label>
                <input
                  type="text"
                  value={userIds}
                  onChange={(e) => setUserIds(e.target.value)}
                  placeholder="e.g., 123e4567-e89b-12d3-a456-426614174000, ..."
                  className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface-alt)] px-4 py-2 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-[var(--accent)] focus:outline-none"
                />
                <p className="mt-1 text-xs text-[var(--text-muted)]">
                  Enter user IDs separated by commas. Find user IDs in the Users list.
                </p>
              </div>
            )}

            {recipients === "emails" && (
              <div>
                <label className="block text-sm font-medium text-[var(--text-primary)] mb-2">
                  Email Addresses (comma-separated)
                </label>
                <input
                  type="text"
                  value={userEmails}
                  onChange={(e) => setUserEmails(e.target.value)}
                  placeholder="e.g., user1@example.com, user2@example.com, ..."
                  className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface-alt)] px-4 py-2 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-[var(--accent)] focus:outline-none"
                />
                <p className="mt-1 text-xs text-[var(--text-muted)]">
                  Enter email addresses separated by commas.
                </p>
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-[var(--text-primary)] mb-2">
                Subject <span className="text-[var(--danger)]">*</span>
              </label>
              <input
                type="text"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="e.g., System Maintenance Notice"
                maxLength={200}
                className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface-alt)] px-4 py-2 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-[var(--accent)] focus:outline-none"
              />
              <p className="mt-1 text-xs text-[var(--text-muted)]">
                {subject.length}/200 characters
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-[var(--text-primary)] mb-2">
                Message <span className="text-[var(--danger)]">*</span>
              </label>
              <textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder="Enter your message here..."
                rows={8}
                className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface-alt)] px-4 py-2 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-[var(--accent)] focus:outline-none resize-none"
              />
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-[var(--border)]">
            <button
              onClick={handleClear}
              disabled={sending}
              className="rounded-lg border border-[var(--border)] px-4 py-2 text-sm font-medium hover:bg-[var(--surface-alt)] disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Clear
            </button>
            <button
              onClick={handleSend}
              disabled={sending}
              className="flex items-center gap-2 rounded-lg bg-[var(--accent)] px-6 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {sending ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  Sending...
                </>
              ) : (
                <>
                  <Send size={16} />
                  Send Broadcast
                </>
              )}
            </button>
          </div>
        </div>
      </Card>

      {showConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-xl border border-[var(--border)] bg-[var(--surface)] shadow-2xl">
            <div className="px-6 py-4 border-b border-[var(--border)]">
              <h3 className="text-lg font-semibold text-[var(--text-primary)]">Confirm Broadcast</h3>
            </div>
            <div className="px-6 py-4">
              <p className="text-sm text-[var(--text-primary)]">{confirmMessage}</p>
            </div>
            <div className="px-6 py-4 border-t border-[var(--border)] flex justify-end gap-3">
              <button
                onClick={() => setShowConfirm(false)}
                className="rounded-lg border border-[var(--border)] px-4 py-2 text-sm font-medium hover:bg-[var(--surface-alt)]"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmSend}
                className="rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white hover:opacity-90"
              >
                Send
              </button>
            </div>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}
