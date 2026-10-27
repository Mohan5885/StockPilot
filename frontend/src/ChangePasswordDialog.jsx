import { useState } from "react";
import { KeyRound, X } from "lucide-react";

export default function ChangePasswordDialog({ employee, onClose, onSubmit }) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  async function submit(event) {
    event.preventDefault();
    setError("");
    setMessage("");
    if (newPassword !== confirmPassword) {
      setError("The new password and confirmation do not match.");
      return;
    }

    setBusy(true);
    try {
      const response = await onSubmit({
        current_password: currentPassword,
        new_password: newPassword,
        confirm_password: confirmPassword,
      });
      setMessage(response.detail || "Password changed successfully.");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (err) {
      setError(err.message || "Unable to change password.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="account-dialog-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !busy) onClose();
      }}
    >
      <section
        className="account-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="change-password-title"
      >
        <div className="account-dialog-heading">
          <div>
            <span className="account-dialog-eyebrow">
              Account security · {employee.username}
            </span>
            <h2 id="change-password-title">Change password</h2>
          </div>
          <button
            type="button"
            className="account-dialog-close"
            onClick={onClose}
            aria-label="Close change password"
            disabled={busy}
          >
            <X size={20} />
          </button>
        </div>
        {error && <div className="account-dialog-alert is-error">{error}</div>}
        {message && <div className="account-dialog-alert">{message}</div>}
        <form className="account-dialog-form" onSubmit={submit}>
          <label>
            Current password
            <input
              type="password"
              value={currentPassword}
              onChange={(event) => setCurrentPassword(event.target.value)}
              autoComplete="current-password"
              required
            />
          </label>
          <label>
            New password
            <input
              type="password"
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
              autoComplete="new-password"
              minLength={8}
              required
            />
          </label>
          <label>
            Confirm new password
            <input
              type="password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              autoComplete="new-password"
              minLength={8}
              required
            />
          </label>
          <div className="account-dialog-actions">
            <button type="button" className="account-secondary-button" onClick={onClose} disabled={busy}>
              Cancel
            </button>
            <button type="submit" className="account-primary-button" disabled={busy}>
              <KeyRound size={16} aria-hidden="true" />
              {busy ? "Saving…" : "Update password"}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
