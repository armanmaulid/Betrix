import { useState } from "react";
import { ShieldAlert } from "lucide-react";
import { Modal } from "../ui/Modal";
import { useUpdateUser, useDeleteUser } from "../../hooks/useUsers";
import { getApiErrorMessage } from "../../api/client";
import { useToast } from "../../context/ToastContext";
import type { AdminUserRow } from "../../types";

interface EditUserModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: AdminUserRow;
}

export function EditUserModal({ isOpen, onClose, user }: EditUserModalProps) {
  const [status, setStatus] = useState(user.status);
  const [isAdmin, setIsAdmin] = useState(user.isAdmin);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmAdminGrant, setConfirmAdminGrant] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { showToast } = useToast();
  const updateMutation = useUpdateUser(user.id);
  const deleteMutation = useDeleteUser();

  function persistChanges() {
    setError(null);
    updateMutation.mutate(
      { status, isAdmin },
      {
        onSuccess: () => {
          showToast(`Perubahan untuk ${user.email} disimpan.`, "success");
          onClose();
        },
        onError: (err) => setError(getApiErrorMessage(err, "Gagal update user")),
      }
    );
  }

  function handleSave() {
    // Granting admin access is sensitive — require an explicit second
    // confirmation step instead of applying it the moment the checkbox
    // is ticked and Save is clicked.
    const isGrantingAdmin = isAdmin && !user.isAdmin;
    if (isGrantingAdmin && !confirmAdminGrant) {
      setConfirmAdminGrant(true);
      return;
    }
    persistChanges();
  }

  function handleDelete() {
    setError(null);
    deleteMutation.mutate(user.id, {
      onSuccess: () => {
        showToast(`Akun ${user.email} berhasil dihapus.`, "success");
        onClose();
      },
      onError: (err) => setError(getApiErrorMessage(err, "Gagal hapus user")),
    });
  }

  function handleClose() {
    setConfirmAdminGrant(false);
    setConfirmDelete(false);
    onClose();
  }

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title={`Kelola ${user.email}`}>
      {confirmDelete ? (
        <div className="space-y-4">
          <p className="text-sm text-[var(--text-primary)]">
            Yakin mau hapus akun <strong>{user.email}</strong>? Aksi ini tidak
            bisa dibatalkan.
          </p>
          {error && <p className="text-sm text-[var(--danger)]">{error}</p>}
          <div className="flex gap-2">
            <button
              onClick={() => setConfirmDelete(false)}
              className="flex-1 rounded-lg border border-[var(--border)] py-2 text-sm font-medium hover:bg-[var(--surface-alt)]"
            >
              Batal
            </button>
            <button
              onClick={handleDelete}
              disabled={deleteMutation.isPending}
              className="flex-1 rounded-lg bg-[var(--danger)] py-2 text-sm font-medium text-white disabled:opacity-60"
            >
              {deleteMutation.isPending ? "Menghapus..." : "Ya, Hapus"}
            </button>
          </div>
        </div>
      ) : confirmAdminGrant ? (
        <div className="space-y-4">
          <div className="flex items-start gap-3 rounded-lg bg-[var(--warning-soft)] p-3">
            <ShieldAlert size={18} className="mt-0.5 flex-shrink-0 text-[var(--warning)]" />
            <p className="text-sm text-[var(--text-primary)]">
              Kamu akan memberi akses <strong>admin penuh</strong> ke{" "}
              <strong>{user.email}</strong>. Admin bisa mengelola user lain, broadcast pesan,
              dan melihat data sensitif. Lanjutkan?
            </p>
          </div>
          {error && <p className="text-sm text-[var(--danger)]">{error}</p>}
          <div className="flex gap-2">
            <button
              onClick={() => setConfirmAdminGrant(false)}
              disabled={updateMutation.isPending}
              className="flex-1 rounded-lg border border-[var(--border)] py-2 text-sm font-medium hover:bg-[var(--surface-alt)] disabled:opacity-50"
            >
              Batal
            </button>
            <button
              onClick={persistChanges}
              disabled={updateMutation.isPending}
              className="flex-1 rounded-lg bg-[var(--warning)] py-2 text-sm font-medium text-white disabled:opacity-60"
            >
              {updateMutation.isPending ? "Menyimpan..." : "Ya, Jadikan Admin"}
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <div>
            <label className="mb-1 block text-xs font-medium text-[var(--text-muted)]">
              Status Akun
            </label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as typeof status)}
              className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm outline-none focus:border-[var(--accent)]"
            >
              <option value="active">Active</option>
              <option value="suspended">Suspended</option>
              <option value="banned">Banned</option>
            </select>
          </div>

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={isAdmin}
              onChange={(e) => setIsAdmin(e.target.checked)}
            />
            Jadikan admin
          </label>

          {error && <p className="text-sm text-[var(--danger)]">{error}</p>}

          <div className="flex gap-2">
            <button
              onClick={handleSave}
              disabled={updateMutation.isPending}
              className="flex-1 rounded-lg bg-[var(--accent)] py-2 text-sm font-medium text-white disabled:opacity-60"
            >
              {updateMutation.isPending ? "Menyimpan..." : "Simpan"}
            </button>
          </div>

          <button
            onClick={() => setConfirmDelete(true)}
            className="w-full rounded-lg border border-[var(--danger)] py-2 text-sm font-medium text-[var(--danger)] hover:bg-[var(--danger-soft)]"
          >
            Hapus User
          </button>
        </div>
      )}
    </Modal>
  );
}
