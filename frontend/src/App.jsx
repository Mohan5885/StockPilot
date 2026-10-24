import { lazy, Suspense, useCallback, useEffect, useRef, useState } from "react";
import {
  BadgeCheck,
  Bot,
  Building2,
  BriefcaseBusiness,
  CircleUserRound,
  Clock3,
  LogOut,
  Mail,
  MessageCircle,
  RotateCcw,
  Phone,
  Send,
  ShieldAlert,
  Trash2,
  X,
} from "lucide-react";
import "./App.css";

const API = "http://127.0.0.1:8000";
const DashboardCharts = lazy(() => import("./DashboardCharts.jsx"));

const emptyItem = {
  sku: "",
  name: "",
  description: "",
  unit_price: "",
  quantity: "0",
  reorder_level: "5",
  is_active: true,
};

const emptyPurchase = {
  reference: "",
  supplier_name: "",
  item: "",
  quantity: "1",
  unit_cost: "",
  notes: "",
};

const emptySale = {
  reference: "",
  item: "",
  quantity: "1",
  notes: "",
};

const emptyStaffForm = {
  employee_id: "",
  full_name: "",
  email: "",
  mobile_number: "",
  department: "",
  job_title: "",
  start_date: "",
  password: "",
};

const money = (value) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 2,
  }).format(Number(value || 0));

const dateTime = (value) =>
  value ? new Date(value).toLocaleString("en-IN") : "—";

function csvCell(value) {
  const text = String(value ?? "").replace(/\s+/g, " ").trim();
  const safeText = /^[=+\-@]/.test(text) ? `'${text}` : text;
  return `"${safeText.replace(/"/g, '""')}"`;
}

function exportText(value) {
  if (value == null || typeof value === "boolean") return "";
  if (["string", "number", "bigint"].includes(typeof value)) {
    return String(value);
  }
  if (Array.isArray(value)) {
    return value.map(exportText).filter(Boolean).join(" ");
  }
  if (typeof value === "object" && value.props) {
    return exportText(value.props.children);
  }
  return "";
}

function downloadCsv(filename, headers, rows) {
  const content = [headers, ...rows]
    .map((row) => row.map(csvCell).join(","))
    .join("\r\n");
  const blob = new Blob(["\uFEFF", content], {
    type: "text/csv;charset=utf-8;",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${filename}-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

async function apiRequest(path, employee, options = {}) {
  const headers = {
    ...(options.body ? { "Content-Type": "application/json" } : {}),
    ...(employee?.token
      ? { Authorization: `Token ${employee.token}` }
      : {}),
    ...options.headers,
  };

  const response = await fetch(`${API}${path}`, {
    ...options,
    headers,
  });

  const text = await response.text();
  let data = null;

  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }

  if (!response.ok) {
    if (data && typeof data === "object") {
      const messages = Object.entries(data).map(([key, value]) => {
        const detail = Array.isArray(value)
          ? value.join(", ")
          : String(value);

        return key === "detail" || key === "non_field_errors"
          ? detail
          : `${key}: ${detail}`;
      });

      throw new Error(messages.join("\n") || "Request failed.");
    }

    throw new Error(data || `Request failed (${response.status}).`);
  }

  return data;
}

const buttonStyle = {
  padding: "10px 15px",
  border: "1px solid #d8e0e6",
  borderRadius: 8,
  background: "#ffffff",
  color: "#24313d",
  cursor: "pointer",
  fontWeight: 600,
};

const primaryButton = {
  ...buttonStyle,
  background: "#167d68",
  color: "#ffffff",
  border: "1px solid #167d68",
};

const inputStyle = {
  width: "100%",
  boxSizing: "border-box",
  padding: "10px 12px",
  border: "1px solid #d8e0e6",
  borderRadius: 8,
  marginTop: 6,
  background: "#ffffff",
  color: "#24313d",
};

const panelStyle = {
  background: "#ffffff",
  color: "#24313d",
  border: "1px solid #e0e6eb",
  borderRadius: 8,
  padding: 20,
  marginBottom: 18,
  boxShadow: "0 2px 8px rgba(16, 24, 40, 0.04)",
};

function Field({ label, children }) {
  return (
    <label style={{ display: "block", marginBottom: 14, fontSize: 13 }}>
      <span style={{ fontWeight: 600, color: "#475467" }}>{label}</span>
      {children}
    </label>
  );
}

function TextInput(props) {
  return <input {...props} style={{ ...inputStyle, ...props.style }} />;
}

function Notice({ message, error }) {
  if (!message) return null;

  return (
    <div
      role="status"
      style={{
        padding: 12,
        marginBottom: 16,
        borderRadius: 8,
        whiteSpace: "pre-wrap",
        color: error ? "#a32121" : "#17683c",
        background: error ? "#fff0f0" : "#eaf8ef",
        border: `1px solid ${error ? "#ffd1d1" : "#bde8cb"}`,
      }}
    >
      {message}
    </div>
  );
}

function Table({
  columns,
  rows,
  emptyMessage = "No records found.",
  exportName = "records",
}) {
  const exportableColumns = columns.filter(
    (column) => column.export !== false
  );

  function exportRows() {
    const data = rows.map((row) =>
      exportableColumns.map((column) => {
        const value = column.exportValue
          ? column.exportValue(row)
          : column.render
            ? column.render(row)
            : row[column.key] ?? "—";
        return exportText(value);
      })
    );
    const filename = exportName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");
    downloadCsv(
      filename || "records",
      exportableColumns.map((column) => column.label),
      data
    );
  }

  return (
    <div style={{ overflowX: "auto" }}>
      <div className="table-export-toolbar">
        <button
          type="button"
          style={buttonStyle}
          onClick={exportRows}
          disabled={rows.length === 0 || exportableColumns.length === 0}
          aria-label={`Download ${exportName} as CSV`}
        >
          Download CSV
        </button>
      </div>
      <table
        style={{
          width: "100%",
          borderCollapse: "collapse",
          textAlign: "left",
          fontSize: 13,
        }}
      >
        <thead>
          <tr>
            {columns.map((column) => (
              <th
                key={column.label}
                style={{
                  padding: "12px 10px",
                  color: "#667085",
                  background: "#f3f6f8",
                  borderBottom: "1px solid #e0e6eb",
                  whiteSpace: "nowrap",
                }}
              >
                {column.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td
                colSpan={columns.length}
                style={{
                  padding: 22,
                  textAlign: "center",
                  color: "#667085",
                }}
              >
                {emptyMessage}
              </td>
            </tr>
          ) : (
            rows.map((row, index) => (
              <tr key={row.id ?? index}>
                {columns.map((column) => (
                  <td
                    key={column.label}
                    style={{
                      padding: "13px 10px",
                      borderBottom: "1px solid #edf0f2",
                      verticalAlign: "top",
                    }}
                  >
                    {column.render
                      ? column.render(row)
                      : row[column.key] ?? "—"}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

function LoginPage({ onLogin, sessionNotice }) {
  const [portal, setPortal] = useState("STAFF");
  const [loginMode, setLoginMode] = useState("login");
  const [employeeId, setEmployeeId] = useState("");
  const [password, setPassword] = useState("");
  const [approvalCode, setApprovalCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [requestSent, setRequestSent] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [flowMessage, setFlowMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const passwordTimer = useRef(null);

  useEffect(() => {
    return () => {
      if (passwordTimer.current) clearTimeout(passwordTimer.current);
    };
  }, []);

  function togglePasswordVisibility() {
    if (passwordTimer.current) {
      clearTimeout(passwordTimer.current);
      passwordTimer.current = null;
    }

    if (showPassword) {
      setShowPassword(false);
      return;
    }

    setShowPassword(true);

    passwordTimer.current = setTimeout(() => {
      setShowPassword(false);
      passwordTimer.current = null;
    }, 3000);
  }

  async function submit(event) {
    event.preventDefault();
    setError("");
    setFlowMessage("");
    setBusy(true);

    try {
      const data = await apiRequest("/api/auth/login/", null, {
        method: "POST",
        body: JSON.stringify({
          employee_id: employeeId.trim(),
          portal,
          password,
        }),
      });

      if (!data?.token || !data?.employee) {
        throw new Error(
          "The login response did not contain employee details."
        );
      }

      onLogin({ ...data.employee, token: data.token });
    } catch (err) {
      setError(err.message || "Login failed.");
    } finally {
      setBusy(false);
    }
  }

  async function requestPasswordReset(event) {
    event.preventDefault();
    setError("");
    setFlowMessage("");
    setBusy(true);

    try {
      const data = await apiRequest("/api/auth/password-reset-requests/", null, {
        method: "POST",
        body: JSON.stringify({
          employee_id: employeeId.trim(),
          portal,
        }),
      });
      setRequestSent(true);
      setFlowMessage(
        data?.detail ||
          "If the account matches, a password reset request has been sent to an administrator for review."
      );
    } catch (err) {
      setError(err.message || "Unable to submit the password reset request.");
    } finally {
      setBusy(false);
    }
  }

  async function confirmPasswordReset(event) {
    event.preventDefault();
    setError("");
    setFlowMessage("");

    if (newPassword !== confirmPassword) {
      setError("The new password and confirmation do not match.");
      return;
    }

    setBusy(true);
    try {
      const data = await apiRequest("/api/auth/password-reset-confirm/", null, {
        method: "POST",
        body: JSON.stringify({
          employee_id: employeeId.trim(),
          portal,
          approval_code: approvalCode.trim(),
          new_password: newPassword,
        }),
      });
      setFlowMessage(data?.detail || "Your password has been updated.");
      setLoginMode("login");
      setPassword("");
      setApprovalCode("");
      setNewPassword("");
      setConfirmPassword("");
      setRequestSent(false);
    } catch (err) {
      setError(err.message || "Unable to reset the password.");
    } finally {
      setBusy(false);
    }
  }

  function returnToLogin() {
    setLoginMode("login");
    setError("");
    setFlowMessage("");
    setRequestSent(false);
    setApprovalCode("");
    setNewPassword("");
    setConfirmPassword("");
  }

  return (
    <main className="login-page" style={styles.loginPage}>
      <div className="login-layout">
        <section className="login-showcase" aria-label="StockPilot overview">
          <div className="login-brand">
            <div className="login-brand-mark">SP</div>
            <div>
              <strong>StockPilot</strong>
              <span>INVENTORY WORKSPACE</span>
            </div>
          </div>

          <div className="login-showcase-copy">
            <span className="login-eyebrow">
              <span className="login-eyebrow-dot" />
              INVENTORY, IN FOCUS
            </span>
            <h1>Bring your inventory into better focus.</h1>
            <p>
              A clear, dependable workspace for the people who keep your
              operations moving.
            </p>
          </div>

          <div className="login-visual" aria-hidden="true">
            <div className="login-visual-orbit login-visual-orbit-outer" />
            <div className="login-visual-orbit login-visual-orbit-inner" />
            <div className="login-visual-core">
              <div className="login-visual-core-mark">SP</div>
              <span>STOCKPILOT</span>
              <strong>Inventory workspace</strong>
            </div>
            <div className="login-float-card login-float-card-top">
              <span className="login-float-icon">01</span>
              <span>
                <strong>Stock visibility</strong>
                <small>Stay close to the details</small>
              </span>
              <span className="login-float-dot" />
            </div>
            <div className="login-float-card login-float-card-bottom">
              <span className="login-float-icon login-float-icon-secondary">02</span>
              <span>
                <strong>Activity records</strong>
                <small>Keep work connected</small>
              </span>
              <BadgeCheck size={18} aria-hidden="true" />
            </div>
            <div className="login-visual-grid" />
          </div>

          <div className="login-feature-row">
            <div>
              <span className="login-feature-number">01</span>
              <span>Stock at a glance</span>
            </div>
            <div>
              <span className="login-feature-number">02</span>
              <span>Transactions in context</span>
            </div>
            <div>
              <span className="login-feature-number">03</span>
              <span>Reports when you need them</span>
            </div>
          </div>
          <div className="login-showcase-footer">
            <span>Built for clear, confident operations.</span>
            <span>STOCKPILOT ERP</span>
          </div>
        </section>

        <section className="login-form-side">
          <div className="login-card" style={styles.loginCard}>
            <div className="login-mobile-brand">
              <div className="login-brand-mark">SP</div>
              <strong>StockPilot</strong>
            </div>
            <div className="login-form-heading">
              <span className="login-form-kicker">
                {loginMode === "login" ? "WELCOME BACK" : "ACCOUNT RECOVERY"}
              </span>
              <h2>
                {loginMode === "login"
                  ? "Sign in to continue"
                  : loginMode === "request"
                    ? "Request password help"
                    : "Set a new password"}
              </h2>
              <p>
                {loginMode === "login"
                  ? `Access your ${portal === "ADMIN" ? "administrator" : "staff"} workspace.`
                  : loginMode === "request"
                    ? "An administrator must approve your request before you can reset your password."
                    : "Enter the one-time approval code provided to you by an administrator."}
              </p>
            </div>

            {loginMode !== "reset" && (
              <>
                <div className="login-portal-label">Choose your workspace</div>
                <div className="login-portal-tabs" role="group" aria-label="Choose sign-in portal">
                  {[
                    { role: "STAFF", label: "Staff" },
                    { role: "ADMIN", label: "Admin" },
                  ].map((entry) => (
                    <button
                      key={entry.role}
                      type="button"
                      aria-pressed={portal === entry.role}
                      className={portal === entry.role ? "active" : ""}
                      onClick={() => setPortal(entry.role)}
                    >
                      {entry.label}
                    </button>
                  ))}
                </div>
              </>
            )}

            <Notice message={sessionNotice} />
            <Notice message={error} error />
            <Notice message={flowMessage} />

            {loginMode === "login" && (
              <form onSubmit={submit} className="login-form-inner">
                <div className="login-fields">
              <Field label="Employee ID">
                <TextInput
                  value={employeeId}
                  onChange={(event) => setEmployeeId(event.target.value)}
                  required
                  autoComplete="username"
                  autoCapitalize="none"
                  spellCheck={false}
                  placeholder="Enter your Employee ID"
                />
              </Field>

              <Field label="Password">
                <div className="login-password-wrap">
                  <input
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    required
                    autoComplete="current-password"
                    placeholder="Enter your password"
                    style={{
                      ...inputStyle,
                      marginTop: 0,
                      paddingRight: 75,
                    }}
                  />

                  <button
                    type="button"
                    onClick={togglePasswordVisibility}
                    aria-label={showPassword ? "Hide password" : "Show password"}
                    aria-pressed={showPassword}
                    className="login-password-toggle"
                  >
                    {showPassword ? "Hide" : "Show"}
                  </button>
                </div>
              </Field>
                </div>

                <button
                  type="submit"
                  disabled={busy}
                  className="login-submit"
                  style={{ ...primaryButton, width: "100%", opacity: busy ? 0.7 : 1 }}
                >
                  <span>{busy ? "Signing in…" : "Sign in to workspace"}</span>
                  <span aria-hidden="true">→</span>
                </button>
                <button
                  type="button"
                  className="login-text-action"
                  onClick={() => {
                    setLoginMode("request");
                    setError("");
                    setFlowMessage("");
                  }}
                >
                  Forgot your password?
                </button>
                <div className="login-trust-note">
                  <ShieldAlert size={15} aria-hidden="true" />
                  <span>Sign in with the account assigned to your role.</span>
                </div>
                <div className="login-form-footer">
                  <span>Need access? Contact your system administrator.</span>
                </div>
              </form>
            )}

            {loginMode === "request" && !requestSent && (
              <form className="login-recovery-form" onSubmit={requestPasswordReset}>
                <div className="login-fields">
                  <Field label="Employee ID">
                    <TextInput
                      value={employeeId}
                      onChange={(event) => setEmployeeId(event.target.value)}
                      required
                      autoComplete="username"
                      autoCapitalize="none"
                      spellCheck={false}
                      placeholder="Enter your Employee ID"
                    />
                  </Field>
                </div>
                <button type="submit" disabled={busy} className="login-submit">
                  <span>{busy ? "Sending request…" : "Send approval request"}</span>
                  <span aria-hidden="true">→</span>
                </button>
              </form>
            )}

            {loginMode === "request" && requestSent && (
              <div className="login-recovery-result">
                <div className="login-recovery-check" aria-hidden="true">
                  <BadgeCheck size={24} />
                </div>
                <h3>Request submitted</h3>
                <p>
                  Wait for an administrator to review your request. If approved,
                  they will share a time-limited code with you.
                </p>
                <button
                  type="button"
                  className="login-submit"
                  onClick={() => {
                    setLoginMode("reset");
                    setFlowMessage("");
                    setError("");
                  }}
                >
                  <span>I have an approval code</span>
                  <span aria-hidden="true">→</span>
                </button>
              </div>
            )}

            {loginMode === "reset" && (
              <form className="login-recovery-form" onSubmit={confirmPasswordReset}>
                <div className="login-fields">
                  <Field label="Employee ID">
                    <TextInput
                      value={employeeId}
                      onChange={(event) => setEmployeeId(event.target.value)}
                      required
                      autoComplete="username"
                      autoCapitalize="none"
                      spellCheck={false}
                      placeholder="Enter your Employee ID"
                    />
                  </Field>
                  <Field label="8-digit administrator code">
                    <TextInput
                      value={approvalCode}
                      onChange={(event) =>
                        setApprovalCode(event.target.value.replace(/\D/g, "").slice(0, 8))
                      }
                      required
                      inputMode="numeric"
                      pattern="[0-9]{8}"
                      autoComplete="one-time-code"
                      placeholder="Enter your approval code"
                    />
                  </Field>
                  <Field label="New password">
                    <TextInput
                      type="password"
                      value={newPassword}
                      onChange={(event) => setNewPassword(event.target.value)}
                      required
                      minLength={8}
                      autoComplete="new-password"
                      placeholder="Create a new password"
                    />
                  </Field>
                  <Field label="Confirm new password">
                    <TextInput
                      type="password"
                      value={confirmPassword}
                      onChange={(event) => setConfirmPassword(event.target.value)}
                      required
                      minLength={8}
                      autoComplete="new-password"
                      placeholder="Re-enter your new password"
                    />
                  </Field>
                </div>
                <button type="submit" disabled={busy} className="login-submit">
                  <span>{busy ? "Updating password…" : "Reset password"}</span>
                  <span aria-hidden="true">→</span>
                </button>
              </form>
            )}
            {loginMode !== "login" && (
              <button
                type="button"
                className="login-text-action login-back-action"
                onClick={returnToLogin}
              >
                Back to sign in
              </button>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}

function StatCard({ title, value, description }) {
  return (
    <div className="workspace-stat-card" style={{ ...panelStyle, marginBottom: 0 }}>
      <div style={{ color: "#A9B8AE", fontSize: 13 }}>{title}</div>
      <div style={{ fontSize: 27, fontWeight: 750, margin: "12px 0 6px" }}>
        {value}
      </div>
      <div style={{ color: "#91A99A", fontSize: 12 }}>{description}</div>
    </div>
  );
}

function PageHeading({ title, description, action }) {
  return (
    <div className="workspace-page-heading" style={styles.pageHeading}>
      <div>
        <h1 style={{ margin: 0, fontSize: 25 }}>{title}</h1>
        <p style={{ color: "#A9B8AE", marginBottom: 0 }}>{description}</p>
      </div>
      {action}
    </div>
  );
}

function SectionTitle({ title, subtitle, action }) {
  return (
    <div className="workspace-section-heading" style={styles.sectionHeading}>
      <div>
        <h2 style={{ fontSize: 17, margin: 0 }}>{title}</h2>
        {subtitle && (
          <p style={{ color: "#A9B8AE", fontSize: 13, margin: "5px 0 0" }}>
            {subtitle}
          </p>
        )}
      </div>
      {action}
    </div>
  );
}

function statusStyle(type) {
  return {
    display: "inline-block",
    padding: "5px 9px",
    borderRadius: 20,
    fontSize: 12,
    fontWeight: 600,
    color: type === "low" ? "#995500" : "#17683c",
    background: type === "low" ? "#fff1d8" : "#e4f6eb",
  };
}

function Dashboard({ summary, items, purchases, sales, onNavigate, refresh }) {
  const [healthFilter, setHealthFilter] = useState("Needs attention");
  const lowStock = items.filter(
    (item) =>
      item.is_active &&
      Number(item.quantity) <= Number(item.reorder_level)
  );
  const activeItems = items.filter((item) => item.is_active);
  const healthItems = activeItems
    .map((item) => {
      const quantity = Number(item.quantity);
      const reorderLevel = Number(item.reorder_level);
      const status =
        quantity === 0
          ? "Out of stock"
          : quantity <= reorderLevel
            ? "Low stock"
            : "Healthy";

      return {
        ...item,
        healthStatus: status,
        recommendedUnits: Math.max(0, reorderLevel + 1 - quantity),
      };
    })
    .sort((first, second) => {
      const priority = {
        "Out of stock": 0,
        "Low stock": 1,
        Healthy: 2,
      };
      return (
        priority[first.healthStatus] - priority[second.healthStatus] ||
        Number(first.quantity) - Number(second.quantity) ||
        first.name.localeCompare(second.name)
      );
    });
  const healthCounts = {
    "Needs attention": healthItems.filter(
      (item) => item.healthStatus !== "Healthy"
    ).length,
    "Out of stock": healthItems.filter(
      (item) => item.healthStatus === "Out of stock"
    ).length,
    "Low stock": healthItems.filter(
      (item) => item.healthStatus === "Low stock"
    ).length,
    Healthy: healthItems.filter((item) => item.healthStatus === "Healthy")
      .length,
  };
  const filteredHealthItems = healthItems.filter((item) =>
    healthFilter === "Needs attention"
      ? item.healthStatus !== "Healthy"
      : item.healthStatus === healthFilter
  );
  const [today] = useState(() => {
    const date = new Date();
    date.setHours(0, 0, 0, 0);
    return date;
  });
  const dateKey = (date) =>
    `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  const dayBuckets = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(today);
    date.setDate(today.getDate() - (6 - index));
    return {
      key: dateKey(date),
      label: new Intl.DateTimeFormat("en-IN", { weekday: "short" }).format(
        date
      ),
      sales: 0,
      purchases: 0,
    };
  });
  const bucketByDate = new Map(dayBuckets.map((bucket) => [bucket.key, bucket]));
  let hasRecentActivity = false;

  sales.forEach((sale) => {
    const date = new Date(sale.created_at);
    const bucket = Number.isNaN(date.valueOf())
      ? null
      : bucketByDate.get(dateKey(date));
    if (bucket) {
      bucket.sales += Number(sale.quantity || 0);
      hasRecentActivity = true;
    }
  });

  purchases.forEach((purchase) => {
    const date = new Date(purchase.received_at);
    const bucket = Number.isNaN(date.valueOf())
      ? null
      : bucketByDate.get(dateKey(date));
    if (bucket) {
      bucket.purchases += Number(purchase.quantity || 0);
      hasRecentActivity = true;
    }
  });

  const cutoff = new Date(today);
  cutoff.setDate(today.getDate() - 29);
  const topSellingItems = Array.from(
    sales
      .reduce(
        (totals, sale) => {
      const date = new Date(sale.created_at);
      if (Number.isNaN(date.valueOf()) || date < cutoff) return totals;

      const key = String(sale.item);
      const item = totals.get(key);
      if (!item) return totals;
      item.units += Number(sale.quantity || 0);
      return totals;
        },
        new Map(
          activeItems.map((item) => [
            String(item.id),
            { name: item.name, units: 0 },
          ])
        )
      )
      .values()
  ).sort(
    (first, second) =>
      second.units - first.units || first.name.localeCompare(second.name)
  );

  const stockHealth = [
    {
      name: "Healthy",
      value: activeItems.filter(
        (item) => Number(item.quantity) > Number(item.reorder_level)
      ).length,
      color: "#167d68",
    },
    {
      name: "Low stock",
      value: activeItems.filter(
        (item) =>
          Number(item.quantity) > 0 &&
          Number(item.quantity) <= Number(item.reorder_level)
      ).length,
      color: "#d58a20",
    },
    {
      name: "Out of stock",
      value: activeItems.filter((item) => Number(item.quantity) === 0).length,
      color: "#d65353",
    },
  ];
  return (
    <>
      <PageHeading
        title="Inventory overview"
        description="Here's what's happening with your inventory today."
        action={
          <button style={buttonStyle} onClick={refresh}>
            Refresh
          </button>
        }
      />

      <div style={styles.stats}>
        <StatCard
          title="Active items"
          value={summary?.total_items ?? items.filter((i) => i.is_active).length}
          description="Products in your catalog"
        />
        <StatCard
          title="Total stock units"
          value={
            summary?.total_units ??
            items.reduce((n, i) => n + Number(i.quantity), 0)
          }
          description="Units currently in stock"
        />
        <StatCard
          title="Low-stock items"
          value={summary?.low_stock_count ?? lowStock.length}
          description="At or below reorder level"
        />
        <StatCard
          title="Inventory value"
          value={money(summary?.inventory_value)}
          description="Quantity × unit price"
        />
      </div>

      <Suspense
        fallback={
          <div className="dashboard-chart-grid dashboard-chart-loading">
            <div className="dashboard-chart-empty">Loading dashboard charts…</div>
          </div>
        }
      >
        <DashboardCharts
          activityData={dayBuckets}
          hasRecentActivity={hasRecentActivity}
          stockHealth={stockHealth}
          activeItemCount={activeItems.length}
          topSellingItems={topSellingItems}
        />
      </Suspense>

      <section style={panelStyle}>
        <SectionTitle
          title="Inventory items"
          subtitle="Your products and current stock levels"
          action={
            <button style={buttonStyle} onClick={() => onNavigate("Items")}>
              View all
            </button>
          }
        />
        <Table
          exportName="inventory-items"
          columns={[
            { label: "ITEM", render: (r) => <strong>{r.name}</strong> },
            { label: "SKU", key: "sku" },
            { label: "UNIT PRICE", render: (r) => money(r.unit_price) },
            { label: "STOCK", render: (r) => <strong>{r.quantity}</strong> },
            {
              label: "STATUS",
              render: (r) => (
                <span
                  style={statusStyle(
                    Number(r.quantity) <= Number(r.reorder_level)
                      ? "low"
                      : "ok"
                  )}
                >
                  {Number(r.quantity) <= Number(r.reorder_level)
                    ? "Low stock"
                    : "In stock"}
                </span>
              ),
            },
          ]}
          rows={items.filter((i) => i.is_active).slice(0, 5)}
        />
      </section>

      <section className="inventory-health-panel">
        <div className="inventory-health-heading">
          <div>
            <span className="inventory-health-eyebrow">INVENTORY CONTROL</span>
            <h2>Inventory health center</h2>
            <p>
              Prioritize stock risks and see the minimum units needed to move
              above each reorder threshold.
            </p>
          </div>
          <button
            type="button"
            className="inventory-health-view-all"
            onClick={() => onNavigate("Items")}
          >
            View inventory <span aria-hidden="true">→</span>
          </button>
        </div>

        <div className="inventory-health-summary" aria-label="Inventory health totals">
          <div className="inventory-health-total">
            <span>Active items monitored</span>
            <strong>{healthItems.length}</strong>
          </div>
          <div className="inventory-health-total inventory-health-total-risk">
            <span>Need attention</span>
            <strong>{healthCounts["Needs attention"]}</strong>
          </div>
          <div className="inventory-health-total">
            <span>Healthy</span>
            <strong>{healthCounts.Healthy}</strong>
          </div>
        </div>

        <div
          className="inventory-health-filters"
          role="group"
          aria-label="Filter inventory by stock health"
        >
          {["Needs attention", "Out of stock", "Low stock", "Healthy"].map(
            (filter) => (
              <button
                key={filter}
                type="button"
                className={
                  healthFilter === filter
                    ? "inventory-health-filter is-active"
                    : "inventory-health-filter"
                }
                aria-pressed={healthFilter === filter}
                onClick={() => setHealthFilter(filter)}
              >
                {filter}
                <span>{healthCounts[filter]}</span>
              </button>
            )
          )}
        </div>

        {filteredHealthItems.length === 0 ? (
          <div className="inventory-health-empty" role="status">
            <strong>
              {healthFilter === "Needs attention"
                ? "All active items are above their reorder thresholds."
                : `No ${healthFilter.toLowerCase()} items right now.`}
            </strong>
            <span>
              {healthFilter === "Needs attention"
                ? "Your inventory is in good shape. Check back after the next stock movement."
                : "Choose another health filter to review your inventory."}
            </span>
          </div>
        ) : (
          <div className="inventory-health-list">
            {filteredHealthItems.slice(0, 8).map((item) => (
              <article
                className={`inventory-health-row inventory-health-row-${item.healthStatus
                  .toLowerCase()
                  .replaceAll(" ", "-")}`}
                key={item.id}
              >
                <div className="inventory-health-item">
                  <span className="inventory-health-status-mark" aria-hidden="true" />
                  <div>
                    <strong>{item.name}</strong>
                    <span>{item.sku || "No SKU assigned"}</span>
                  </div>
                </div>
                <span className="inventory-health-status">
                  {item.healthStatus}
                </span>
                <div className="inventory-health-stock">
                  <strong>{item.quantity}</strong>
                  <span>in stock</span>
                </div>
                <div className="inventory-health-reorder">
                  <span>Reorder level {item.reorder_level}</span>
                  <strong>
                    {item.recommendedUnits === 0
                      ? "Threshold met"
                      : `+${item.recommendedUnits} units to clear threshold`}
                  </strong>
                </div>
                <button
                  type="button"
                  className="inventory-health-row-action"
                  onClick={() => onNavigate("Items")}
                  aria-label={`View ${item.name} in inventory`}
                >
                  View item <span aria-hidden="true">→</span>
                </button>
              </article>
            ))}
            {filteredHealthItems.length > 8 && (
              <div className="inventory-health-more">
                Showing the 8 highest-priority items of {filteredHealthItems.length}.
                <button type="button" onClick={() => onNavigate("Items")}>
                  View all items
                </button>
              </div>
            )}
          </div>
        )}
      </section>
    </>
  );
}

function ItemsPage({ items, employee, reload }) {
  const [form, setForm] = useState(emptyItem);
  const [editingId, setEditingId] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [search, setSearch] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  function change(key, value) {
    setForm((old) => ({ ...old, [key]: value }));
  }

  function openNewForm() {
    setEditingId(null);
    setForm({ ...emptyItem });
    setMessage("");
    setError("");
    setShowForm(true);
  }

  function edit(item) {
    setEditingId(item.id);
    setForm({
      sku: item.sku,
      name: item.name,
      description: item.description || "",
      unit_price: String(item.unit_price),
      quantity: String(item.quantity),
      reorder_level: String(item.reorder_level),
      is_active: item.is_active,
    });
    setMessage("");
    setError("");
    setShowForm(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function cancelEdit() {
    setEditingId(null);
    setForm({ ...emptyItem });
    setShowForm(false);
    setError("");
  }

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    setError("");

    const payload = {
      ...form,
      unit_price: Number(form.unit_price),
      quantity: Number(form.quantity),
      reorder_level: Number(form.reorder_level),
    };

    try {
      await apiRequest(
        editingId ? `/api/items/${editingId}/` : "/api/items/",
        employee,
        {
          method: editingId ? "PUT" : "POST",
          body: JSON.stringify(payload),
        }
      );

      setMessage(
        editingId
          ? "Item updated successfully."
          : "Item created successfully."
      );

      setEditingId(null);
      setForm({ ...emptyItem });
      setShowForm(false);
      await reload();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function toggleActive(item) {
    setMessage("");
    setError("");

    try {
      await apiRequest(`/api/items/${item.id}/`, employee, {
        method: "PATCH",
        body: JSON.stringify({ is_active: !item.is_active }),
      });

      setMessage(
        `Item ${item.is_active ? "deactivated" : "activated"} successfully.`
      );
      await reload();
    } catch (err) {
      setError(err.message);
    }
  }

  const filtered = items.filter((item) =>
    `${item.name} ${item.sku}`.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <>
      <PageHeading
        title="Items"
        description="Create, update and manage your inventory catalog."
        action={
          <button
            type="button"
            style={primaryButton}
            onClick={openNewForm}
          >
            + Add Item
          </button>
        }
      />

      <Notice message={message} />
      <Notice message={error} error />

      {showForm && (
        <section style={panelStyle}>
          <SectionTitle title={editingId ? "Edit item" : "Add a new item"} />

          <form onSubmit={submit}>
            <div style={styles.formGrid}>
              <Field label="SKU">
                <TextInput
                  value={form.sku}
                  onChange={(e) => change("sku", e.target.value)}
                  required
                />
              </Field>

              <Field label="Item name">
                <TextInput
                  value={form.name}
                  onChange={(e) => change("name", e.target.value)}
                  required
                />
              </Field>

              <Field label="Unit price (₹)">
                <TextInput
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.unit_price}
                  onChange={(e) => change("unit_price", e.target.value)}
                  required
                />
              </Field>

              <Field label="Opening/current quantity">
                <TextInput
                  type="number"
                  min="0"
                  step="1"
                  value={form.quantity}
                  onChange={(e) => change("quantity", e.target.value)}
                  required
                />
              </Field>

              <Field label="Reorder level">
                <TextInput
                  type="number"
                  min="0"
                  step="1"
                  value={form.reorder_level}
                  onChange={(e) => change("reorder_level", e.target.value)}
                  required
                />
              </Field>

              <Field label="Description">
                <TextInput
                  value={form.description}
                  onChange={(e) => change("description", e.target.value)}
                />
              </Field>
            </div>

            <label
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                marginBottom: 15,
                cursor: "pointer",
                fontSize: 14,
                color: "#F0FDF4",
                whiteSpace: "nowrap",
              }}
            >
              <input
                type="checkbox"
                checked={form.is_active}
                onChange={(e) => change("is_active", e.target.checked)}
                style={{
                  width: 18,
                  height: 18,
                  margin: 0,
                  flexShrink: 0,
                  accentColor: "#16A34A",
                  cursor: "pointer",
                }}
              />
              <span>Active item</span>
            </label>

            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button
                type="submit"
                style={primaryButton}
                disabled={busy}
              >
                {busy
                  ? "Saving…"
                  : editingId
                    ? "Save changes"
                    : "Create item"}
              </button>

              <button
                type="button"
                style={buttonStyle}
                onClick={cancelEdit}
                disabled={busy}
              >
                Cancel
              </button>
            </div>
          </form>
        </section>
      )}

      <section style={panelStyle}>
        <SectionTitle
          title="Inventory catalog"
          subtitle={`${items.length} item records`}
          action={
            <input
              placeholder="Search name or SKU…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{ ...inputStyle, width: 220, marginTop: 0 }}
            />
          }
        />

        <Table
          exportName="inventory-catalog"
          columns={[
            {
              label: "ITEM",
              render: (r) => (
                <>
                  <strong>{r.name}</strong>
                  <div style={{ color: "#A9B8AE" }}>{r.description}</div>
                </>
              ),
            },
            { label: "SKU", key: "sku" },
            { label: "PRICE", render: (r) => money(r.unit_price) },
            { label: "STOCK", key: "quantity" },
            { label: "REORDER AT", key: "reorder_level" },
            {
              label: "STATUS",
              render: (r) => (r.is_active ? "Active" : "Inactive"),
            },
            {
              label: "ACTIONS",
              export: false,
              render: (r) => (
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  <button
                    type="button"
                    style={buttonStyle}
                    onClick={() => edit(r)}
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    style={buttonStyle}
                    onClick={() => toggleActive(r)}
                  >
                    {r.is_active ? "Deactivate" : "Activate"}
                  </button>
                </div>
              ),
            },
          ]}
          rows={filtered}
        />
      </section>
    </>
  );
}

function PurchasesPage({ items, employee, purchases, reload, reloadAll }) {
  const [form, setForm] = useState({ ...emptyPurchase });
  const [showForm, setShowForm] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const activeItems = items.filter((item) => item.is_active);

  function change(key, value) {
    setForm((old) => ({ ...old, [key]: value }));
  }

  function openForm() {
    setForm({ ...emptyPurchase });
    setMessage("");
    setError("");
    setShowForm(true);
  }

  function cancelForm() {
    setShowForm(false);
    setForm({ ...emptyPurchase });
    setError("");
  }

  async function submit(event) {
    event.preventDefault();
    setMessage("");
    setError("");
    setBusy(true);

    try {
      await apiRequest("/api/purchases/", employee, {
        method: "POST",
        body: JSON.stringify({
          ...form,
          item: Number(form.item),
          quantity: Number(form.quantity),
          unit_cost: Number(form.unit_cost).toFixed(2),
        }),
      });

      setMessage("Purchase recorded. Inventory stock has been increased.");
      setForm({ ...emptyPurchase });
      setShowForm(false);

      await Promise.all([reload(), reloadAll()]);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PageHeading
        title="Purchases"
        description="Record incoming stock from suppliers."
        action={
          <button type="button" style={primaryButton} onClick={openForm}>
            + Record Purchase
          </button>
        }
      />

      <Notice message={message} />
      <Notice message={error} error />

      {showForm && (
        <section style={panelStyle}>
          <SectionTitle
            title="Record a purchase"
            subtitle="Stock will increase automatically after saving."
          />

          <form onSubmit={submit}>
            <div style={styles.formGrid}>
              <Field label="Purchase reference">
                <TextInput
                  value={form.reference}
                  onChange={(e) => change("reference", e.target.value)}
                  required
                />
              </Field>

              <Field label="Supplier name">
                <TextInput
                  value={form.supplier_name}
                  onChange={(e) => change("supplier_name", e.target.value)}
                  required
                />
              </Field>

              <Field label="Item">
                <select
                  style={inputStyle}
                  value={form.item}
                  onChange={(e) => change("item", e.target.value)}
                  required
                >
                  <option value="">Select an item</option>
                  {activeItems.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name} ({item.sku}) — Stock: {item.quantity}
                    </option>
                  ))}
                </select>
              </Field>

              <Field label="Quantity received">
                <TextInput
                  type="number"
                  min="1"
                  step="1"
                  value={form.quantity}
                  onChange={(e) => change("quantity", e.target.value)}
                  required
                />
              </Field>

              <Field label="Unit cost (₹)">
                <TextInput
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={form.unit_cost}
                  onChange={(e) => change("unit_cost", e.target.value)}
                  required
                />
              </Field>

              <Field label="Notes">
                <TextInput
                  value={form.notes}
                  onChange={(e) => change("notes", e.target.value)}
                />
              </Field>
            </div>

            <p style={{ color: "#A9B8AE", fontSize: 13 }}>
              Purchase total:{" "}
              <strong>
                {money(Number(form.quantity) * Number(form.unit_cost))}
              </strong>
            </p>

            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button
                type="submit"
                style={primaryButton}
                disabled={busy || activeItems.length === 0}
              >
                {busy ? "Recording…" : "Record purchase"}
              </button>

              <button
                type="button"
                style={buttonStyle}
                onClick={cancelForm}
                disabled={busy}
              >
                Cancel
              </button>
            </div>

            {activeItems.length === 0 && (
              <p style={{ color: "#a32121", fontSize: 13 }}>
                Add or activate an inventory item before recording a purchase.
              </p>
            )}
          </form>
        </section>
      )}

      <section style={panelStyle}>
        <SectionTitle
          title="Purchase history"
          subtitle="Most recent purchases first."
          action={
            <button style={buttonStyle} onClick={reload}>
              Refresh
            </button>
          }
        />

        <Table
          exportName="purchase-history"
          columns={[
            { label: "REFERENCE", key: "reference" },
            { label: "SUPPLIER", key: "supplier_name" },
            {
              label: "ITEM",
              render: (r) =>
                `${r.item_name || "Item"} (${r.item_sku || r.item})`,
            },
            { label: "QTY", key: "quantity" },
            { label: "UNIT COST", render: (r) => money(r.unit_cost) },
            {
              label: "TOTAL",
              render: (r) =>
                money(
                  r.total_cost ??
                    Number(r.quantity) * Number(r.unit_cost)
                ),
            },
            { label: "RECEIVED", render: (r) => dateTime(r.received_at) },
          ]}
          rows={purchases}
        />
      </section>
    </>
  );
}

function SalesPage({ items, employee, sales, reload, reloadAll }) {
  const [form, setForm] = useState({ ...emptySale });
  const [showForm, setShowForm] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const activeItems = items.filter((item) => item.is_active);
  const selectedItem = items.find(
    (item) => String(item.id) === form.item
  );

  function change(key, value) {
    setForm((old) => ({ ...old, [key]: value }));
  }

  function openForm() {
    setForm({ ...emptySale });
    setMessage("");
    setError("");
    setShowForm(true);
  }

  function cancelForm() {
    setShowForm(false);
    setForm({ ...emptySale });
    setError("");
  }

  async function submit(event) {
    event.preventDefault();
    setMessage("");
    setError("");
    setBusy(true);

    try {
      await apiRequest("/api/sales/", employee, {
        method: "POST",
        body: JSON.stringify({
          ...form,
          item: Number(form.item),
          quantity: Number(form.quantity),
        }),
      });

      setMessage("Sale/issue recorded. Stock has been reduced.");
      setForm({ ...emptySale });
      setShowForm(false);

      await Promise.all([reload(), reloadAll()]);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PageHeading
        title="Sales / Issues"
        description="Record outgoing stock and track issued items."
        action={
          <button type="button" style={primaryButton} onClick={openForm}>
            + Record Sale / Issue
          </button>
        }
      />

      <Notice message={message} />
      <Notice message={error} error />

      {showForm && (
        <section style={panelStyle}>
          <SectionTitle
            title="Record outgoing stock"
            subtitle="The system will prevent issuing more stock than is available."
          />

          <form onSubmit={submit}>
            <div style={styles.formGrid}>
              <Field label="Sale / issue reference">
                <TextInput
                  value={form.reference}
                  onChange={(e) => change("reference", e.target.value)}
                  placeholder="e.g. SALE-001"
                  required
                />
              </Field>

              <Field label="Item">
                <select
                  style={inputStyle}
                  value={form.item}
                  onChange={(e) => change("item", e.target.value)}
                  required
                >
                  <option value="">Select an item</option>
                  {activeItems.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name} ({item.sku}) — Available: {item.quantity}
                    </option>
                  ))}
                </select>
              </Field>

              <Field label="Quantity issued / sold">
                <TextInput
                  type="number"
                  min="1"
                  max={selectedItem?.quantity ?? undefined}
                  step="1"
                  value={form.quantity}
                  onChange={(e) => change("quantity", e.target.value)}
                  required
                />
              </Field>

              <Field label="Notes">
                <TextInput
                  value={form.notes}
                  onChange={(e) => change("notes", e.target.value)}
                  placeholder="Optional details"
                />
              </Field>
            </div>

            {selectedItem && (
              <p style={{ color: "#A9B8AE", fontSize: 13 }}>
                Available: <strong>{selectedItem.quantity}</strong> units ·
                After this transaction:{" "}
                <strong>
                  {Math.max(
                    0,
                    Number(selectedItem.quantity) - Number(form.quantity || 0)
                  )}
                </strong>{" "}
                units
              </p>
            )}

            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button
                type="submit"
                style={primaryButton}
                disabled={busy || activeItems.length === 0}
              >
                {busy ? "Saving…" : "Record sale / issue"}
              </button>

              <button
                type="button"
                style={buttonStyle}
                onClick={cancelForm}
                disabled={busy}
              >
                Cancel
              </button>
            </div>

            {activeItems.length === 0 && (
              <p style={{ color: "#a32121", fontSize: 13 }}>
                Add or activate an inventory item before recording a sale or
                issue.
              </p>
            )}
          </form>
        </section>
      )}

      <section style={panelStyle}>
        <SectionTitle
          title="Sales / issues history"
          subtitle="Recorded outgoing stock transactions."
          action={
            <button style={buttonStyle} onClick={reload}>
              Refresh
            </button>
          }
        />

        <Table
          exportName="sales-issues-history"
          columns={[
            { label: "REFERENCE", key: "reference" },
            {
              label: "ITEM",
              render: (r) =>
                `${r.item_name || "Item"} (${r.item_sku || r.item})`,
            },
            { label: "QUANTITY", key: "quantity" },
            { label: "STOCK BEFORE", key: "quantity_before" },
            { label: "STOCK AFTER", key: "quantity_after" },
            { label: "NOTES", key: "notes" },
            { label: "DATE", render: (r) => dateTime(r.created_at) },
          ]}
          rows={sales}
        />
      </section>
    </>
  );
}

function MovementsPage({ movements, items, reload }) {
  const [itemFilter, setItemFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState("");

  const filtered = movements.filter((movement) => {
    const itemMatches =
      !itemFilter || String(movement.item) === itemFilter;
    const typeMatches =
      !typeFilter || movement.movement_type === typeFilter;

    return itemMatches && typeMatches;
  });

  return (
    <>
      <PageHeading
        title="Stock Movements"
        description="Audit the movement of stock into and out of your inventory."
        action={
          <button style={buttonStyle} onClick={reload}>
            Refresh
          </button>
        }
      />

      <section style={panelStyle}>
        <div style={styles.filterRow}>
          <Field label="Filter by item">
            <select
              style={inputStyle}
              value={itemFilter}
              onChange={(e) => setItemFilter(e.target.value)}
            >
              <option value="">All items</option>
              {items.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name} ({item.sku})
                </option>
              ))}
            </select>
          </Field>

          <Field label="Movement type">
            <select
              style={inputStyle}
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
            >
              <option value="">All movements</option>
              <option value="PURCHASE">Purchase / inbound</option>
              <option value="SALE">Sale / issue</option>
              <option value="ADJUSTMENT">Adjustment</option>
            </select>
          </Field>
        </div>

        <Table
          exportName="stock-movements"
          columns={[
            { label: "DATE", render: (r) => dateTime(r.created_at) },
            { label: "TYPE", render: (r) => r.movement_type },
            { label: "REFERENCE", key: "reference" },
            {
              label: "ITEM",
              render: (r) =>
                `${r.item_name || "Item"} (${r.item_sku || r.item})`,
            },
            { label: "QTY", key: "quantity" },
            { label: "BEFORE", key: "quantity_before" },
            { label: "AFTER", key: "quantity_after" },
            { label: "NOTES", key: "notes" },
            {
              label: "RECORDED BY",
              render: (r) => r.created_by_username || "—",
            },
          ]}
          rows={filtered}
        />

        <p style={{ color: "#A9B8AE", fontSize: 12 }}>
          Showing {filtered.length} of {movements.length} movement records.
        </p>
      </section>
    </>
  );
}

function ReportsPage({ items, purchases, sales, movements, summary, refresh }) {
  const activeItems = items.filter((item) => item.is_active);
  const lowStock = activeItems.filter(
    (item) => Number(item.quantity) <= Number(item.reorder_level)
  );

  const totalPurchaseValue = purchases.reduce(
    (sum, purchase) =>
      sum +
      Number(
        purchase.total_cost ??
          Number(purchase.quantity) * Number(purchase.unit_cost)
      ),
    0
  );

  return (
    <>
      <PageHeading
        title="Reports"
        description="An overview of stock levels, inventory value and transaction activity."
        action={
          <button style={buttonStyle} onClick={refresh}>
            Refresh reports
          </button>
        }
      />

      <div style={styles.stats}>
        <StatCard
          title="Active items"
          value={activeItems.length}
          description="Active catalog records"
        />
        <StatCard
          title="Inventory value"
          value={money(
            summary?.inventory_value ??
              activeItems.reduce(
                (sum, item) =>
                  sum + Number(item.quantity) * Number(item.unit_price),
                0
              )
          )}
          description="Current quantity × unit price"
        />
        <StatCard
          title="Purchase records"
          value={purchases.length}
          description="Recorded incoming transactions"
        />
        <StatCard
          title="Sales / issues"
          value={sales.length}
          description="Recorded outgoing transactions"
        />
      </div>

      <section style={panelStyle}>
        <SectionTitle
          title="Stock status report"
          subtitle="Current stock against each item's reorder level."
        />
        <Table
          exportName="stock-status-report"
          columns={[
            { label: "ITEM", render: (r) => <strong>{r.name}</strong> },
            { label: "SKU", key: "sku" },
            { label: "CURRENT STOCK", key: "quantity" },
            { label: "REORDER LEVEL", key: "reorder_level" },
            { label: "UNIT PRICE", render: (r) => money(r.unit_price) },
            {
              label: "STOCK VALUE",
              render: (r) =>
                money(Number(r.quantity) * Number(r.unit_price)),
            },
            {
              label: "STATUS",
              render: (r) =>
                Number(r.quantity) <= Number(r.reorder_level)
                  ? "LOW STOCK"
                  : "IN STOCK",
            },
          ]}
          rows={activeItems}
        />
      </section>

      <section style={panelStyle}>
        <SectionTitle
          title="Low-stock report"
          subtitle={`${lowStock.length} active item(s) at or below reorder level.`}
        />
        <Table
          exportName="low-stock-report"
          columns={[
            { label: "ITEM", key: "name" },
            { label: "SKU", key: "sku" },
            { label: "CURRENT STOCK", key: "quantity" },
            { label: "REORDER LEVEL", key: "reorder_level" },
          ]}
          rows={lowStock}
          emptyMessage="All active items are above their reorder levels."
        />
      </section>

      <section style={panelStyle}>
        <SectionTitle
          title="Transaction summary"
          subtitle="Totals based on the transaction records currently loaded."
        />
        <div style={styles.stats}>
          <StatCard
            title="Purchase value"
            value={money(totalPurchaseValue)}
            description="Sum of recorded purchase costs"
          />
          <StatCard
            title="Purchase transactions"
            value={purchases.length}
            description="Incoming transactions"
          />
          <StatCard
            title="Sale / issue transactions"
            value={sales.length}
            description="Outgoing transactions"
          />
          <StatCard
            title="Stock movement records"
            value={movements.length}
            description="All recorded stock movements"
          />
        </div>
        <p style={{ color: "#A9B8AE", fontSize: 12, marginTop: 16 }}>
          Purchase value is calculated from recorded purchase quantities and
          unit costs. This report does not calculate profit because sale prices
          and cost-of-goods accounting are not configured.
        </p>
      </section>
    </>
  );
}

function StaffManagementPage({ employee }) {
  const [staff, setStaff] = useState([]);
  const [form, setForm] = useState({ ...emptyStaffForm });
  const [editingStaff, setEditingStaff] = useState(null);
  const [showStaffForm, setShowStaffForm] = useState(false);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function loadStaff() {
    setLoading(true);
    setError("");
    try {
      const data = await apiRequest("/api/auth/staff/", employee);
      setStaff(Array.isArray(data) ? data : data.results || []);
    } catch (err) {
      setError(err.message || "Unable to load staff accounts.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    let active = true;
    apiRequest("/api/auth/staff/", employee)
      .then((data) => {
        if (active) setStaff(Array.isArray(data) ? data : data.results || []);
      })
      .catch((err) => {
        if (active) setError(err.message || "Unable to load staff accounts.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [employee]);

  function updateForm(key, value) {
    setForm((previous) => ({ ...previous, [key]: value }));
  }

  function beginEdit(record) {
    setEditingStaff(record);
    setShowStaffForm(true);
    setForm({
      employee_id: record.employee_id,
      full_name: record.full_name || "",
      email: record.email || "",
      mobile_number: record.mobile_number || "",
      department: record.department || "",
      job_title: record.job_title || "",
      start_date: record.start_date || "",
      password: "",
    });
    setMessage("");
    setError("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function resetForm() {
    setEditingStaff(null);
    setShowStaffForm(false);
    setForm({ ...emptyStaffForm });
    setMessage("");
    setError("");
  }

  async function submitStaff(event) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    setError("");
    const payload = { ...form };
    if (editingStaff) {
      delete payload.employee_id;
      delete payload.password;
    }
    if (!payload.start_date) payload.start_date = null;

    try {
      await apiRequest(
        editingStaff
          ? `/api/auth/staff/${editingStaff.id}/`
          : "/api/auth/staff/",
        employee,
        {
          method: editingStaff ? "PATCH" : "POST",
          body: JSON.stringify(payload),
        }
      );
      await loadStaff();
      setMessage(
        editingStaff
          ? "Staff details updated."
            : "Staff account created. Share the employee ID and initial password securely."
      );
      setEditingStaff(null);
      setShowStaffForm(false);
      setForm({ ...emptyStaffForm });
    } catch (err) {
      setError(err.message || "Unable to save the staff account.");
    } finally {
      setBusy(false);
    }
  }

  async function toggleActive(record) {
    setBusy(true);
    setMessage("");
    setError("");
    try {
      await apiRequest(`/api/auth/staff/${record.id}/`, employee, {
        method: "PATCH",
        body: JSON.stringify({ is_active: !record.is_active }),
      });
      await loadStaff();
      setMessage(
        record.is_active
          ? `${record.full_name || record.employee_id} has been deactivated.`
          : `${record.full_name || record.employee_id} has been reactivated.`
      );
    } catch (err) {
      setError(err.message || "Unable to update staff access.");
    } finally {
      setBusy(false);
    }
  }

  const visibleStaff = staff.filter((record) =>
    [
      record.employee_id,
      record.full_name,
      record.email,
      record.mobile_number,
      record.department,
      record.job_title,
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase()
      .includes(search.toLowerCase())
  );

  if (employee?.role !== "ADMIN") {
    return (
      <section style={panelStyle}>
        <h2>Access denied</h2>
        <p>Only administrators can manage staff accounts.</p>
      </section>
    );
  }

  return (
    <>
      <PageHeading
        title="Staff management"
        description="Create staff accounts and manage access to the inventory workspace."
        action={
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button
              type="button"
              style={primaryButton}
              onClick={() => {
                setEditingStaff(null);
                setForm({ ...emptyStaffForm });
                setMessage("");
                setError("");
                setShowStaffForm(true);
              }}
              disabled={busy}
            >
              Add staff member
            </button>
            <button
              type="button"
              style={buttonStyle}
              onClick={loadStaff}
              disabled={loading || busy}
            >
              Refresh staff
            </button>
          </div>
        }
      />
      <Notice message={message} />
      <Notice message={error} error />

      {showStaffForm && (
        <section style={panelStyle}>
          <SectionTitle
            title={editingStaff ? "Edit staff details" : "Create staff account"}
            subtitle={
              editingStaff
                ? `Employee ID: ${editingStaff.employee_id}`
                : "New accounts are created with staff access only."
            }
          />
          <form onSubmit={submitStaff}>
            <div className="staff-form-grid">
              {!editingStaff && (
                <Field label="Employee ID">
                  <TextInput
                    value={form.employee_id}
                    onChange={(event) =>
                      updateForm("employee_id", event.target.value)
                    }
                    required
                    maxLength={30}
                    autoComplete="off"
                  />
                </Field>
              )}
              <Field label="Full name">
                <TextInput
                  value={form.full_name}
                  onChange={(event) =>
                    updateForm("full_name", event.target.value)
                  }
                  required
                  maxLength={150}
                  autoComplete="name"
                />
              </Field>
              <Field label="Email">
                <TextInput
                  type="email"
                  value={form.email}
                  onChange={(event) => updateForm("email", event.target.value)}
                  autoComplete="email"
                />
              </Field>
              <Field label="Mobile number">
                <TextInput
                  type="tel"
                  value={form.mobile_number}
                  onChange={(event) =>
                    updateForm("mobile_number", event.target.value)
                  }
                  required
                  maxLength={20}
                  autoComplete="tel"
                />
              </Field>
              <Field label="Department">
                <TextInput
                  value={form.department}
                  onChange={(event) =>
                    updateForm("department", event.target.value)
                  }
                  maxLength={100}
                />
              </Field>
              <Field label="Job title">
                <TextInput
                  value={form.job_title}
                  onChange={(event) =>
                    updateForm("job_title", event.target.value)
                  }
                  maxLength={100}
                />
              </Field>
              <Field label="Start date">
                <TextInput
                  type="date"
                  value={form.start_date}
                  onChange={(event) =>
                    updateForm("start_date", event.target.value)
                  }
                />
              </Field>
              {!editingStaff && (
                <Field label="Initial password">
                  <TextInput
                    type="password"
                    value={form.password}
                    onChange={(event) =>
                      updateForm("password", event.target.value)
                    }
                    required
                    autoComplete="new-password"
                    minLength={8}
                  />
                </Field>
              )}
            </div>
            <div className="staff-form-actions">
              <button type="submit" style={primaryButton} disabled={busy}>
                {busy
                  ? "Saving…"
                  : editingStaff
                    ? "Save changes"
                    : "Create staff account"}
              </button>
              <button
                type="button"
                style={buttonStyle}
                onClick={resetForm}
                disabled={busy}
              >
                Cancel
              </button>
            </div>
          </form>
        </section>
      )}

      <section style={panelStyle}>
        <SectionTitle
          title="Staff directory"
          subtitle={`${visibleStaff.length} of ${staff.length} staff account(s)`}
        />
        <div className="staff-directory-toolbar">
          <Field label="Search staff">
            <TextInput
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Name, employee ID, email or department"
            />
          </Field>
        </div>
        {loading && staff.length === 0 ? (
          <p>Loading staff accounts…</p>
        ) : (
          <Table
            exportName="staff-directory"
            columns={[
              {
                label: "STAFF MEMBER",
                render: (record) => (
                  <div>
                    <strong>{record.full_name || "Name not set"}</strong>
                    <div className="staff-table-secondary">{record.employee_id}</div>
                  </div>
                ),
              },
              {
                label: "CONTACT",
                render: (record) => (
                  <div>
                    <div>{record.email || "—"}</div>
                    <div className="staff-table-secondary">{record.mobile_number}</div>
                  </div>
                ),
              },
              {
                label: "DEPARTMENT / ROLE",
                render: (record) => (
                  <div>
                    <div>{record.department || "—"}</div>
                    <div className="staff-table-secondary">{record.job_title || "Staff"}</div>
                  </div>
                ),
              },
              {
                label: "STATUS",
                render: (record) => (
                  <span className={`staff-status ${record.is_active ? "active" : "inactive"}`}>
                    {record.is_active ? "Active" : "Deactivated"}
                  </span>
                ),
              },
              {
                label: "ACTIONS",
                export: false,
                render: (record) => (
                  <div className="staff-row-actions">
                    <button type="button" style={buttonStyle} onClick={() => beginEdit(record)} disabled={busy}>
                      Edit
                    </button>
                    <button
                      type="button"
                      className={record.is_active ? "staff-deactivate-button" : "staff-activate-button"}
                      onClick={() => toggleActive(record)}
                      disabled={busy}
                    >
                      {record.is_active ? "Deactivate" : "Reactivate"}
                    </button>
                  </div>
                ),
              },
            ]}
            rows={visibleStaff}
            emptyMessage={search ? "No staff match your search." : "No staff accounts have been created yet."}
          />
        )}
        <p className="staff-retention-note">
          Deactivated accounts cannot sign in. Their inventory activity and audit history are retained.
        </p>
      </section>
    </>
  );
}

function InventoryResetPage({ employee, refresh }) {
  const [challenge, setChallenge] = useState(null);
  const [enteredCode, setEnteredCode] = useState("");
  const [confirmationText, setConfirmationText] = useState("");
  const [requestingCode, setRequestingCode] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function requestChallenge() {
    setRequestingCode(true);
    setError("");
    setMessage("");
    setEnteredCode("");
    setConfirmationText("");
    try {
      const data = await apiRequest("/api/admin/reset-challenge/", employee, {
        method: "POST",
      });
      setChallenge(data);
    } catch (err) {
      setError(err.message || "Unable to generate a reset code.");
    } finally {
      setRequestingCode(false);
    }
  }

  async function confirmReset(event) {
    event.preventDefault();
    if (enteredCode.trim() !== challenge?.code) {
      setError("Enter the security code exactly as shown.");
      return;
    }
    if (confirmationText.trim() !== "RESET INVENTORY") {
      setError("Type RESET INVENTORY to confirm this action.");
      return;
    }

    setResetting(true);
    setError("");
    setMessage("");
    try {
      const result = await apiRequest("/api/admin/reset/", employee, {
        method: "POST",
        body: JSON.stringify({
          code: enteredCode.trim(),
          confirmation: confirmationText.trim(),
        }),
      });
      setChallenge(null);
      setEnteredCode("");
      setConfirmationText("");
      setMessage(
        `Inventory reset complete. Removed ${result.deleted.items} item(s), ${result.deleted.purchases} purchase(s), and ${result.deleted.stock_movements} stock movement(s). Staff accounts and login history were preserved.`
      );
      await refresh();
    } catch (err) {
      setError(err.message || "Unable to reset inventory data.");
    } finally {
      setResetting(false);
    }
  }

  async function cancelChallenge() {
    try {
      await apiRequest("/api/admin/reset-challenge/cancel/", employee, {
        method: "POST",
      });
    } catch (err) {
      setError(err.message || "Unable to cancel the reset challenge.");
    } finally {
      setChallenge(null);
      setEnteredCode("");
      setConfirmationText("");
    }
  }

  if (employee?.role !== "ADMIN") {
    return (
      <section style={panelStyle}>
        <h2>Access denied</h2>
        <p>Only administrators can reset inventory data.</p>
      </section>
    );
  }

  return (
    <>
      <PageHeading
        title="Inventory reset"
        description="Permanently clear operational inventory records."
      />
      <Notice message={message} />
      <Notice message={error} error />

      <section className="reset-danger-panel" aria-labelledby="reset-panel-title">
        <div className="reset-danger-heading">
          <div className="reset-danger-icon" aria-hidden="true">
            <ShieldAlert size={21} />
          </div>
          <div>
            <h2 id="reset-panel-title">Reset inventory records</h2>
            <p>This action permanently deletes the following data:</p>
          </div>
        </div>

        <ul className="reset-data-list">
          <li>All inventory items and current stock quantities</li>
          <li>All purchase records</li>
          <li>All sales and stock movement history</li>
        </ul>

        <div className="reset-preservation-note">
          Staff accounts and login history are not deleted.
        </div>

        {!challenge ? (
          <button
            type="button"
            className="reset-request-button"
            onClick={requestChallenge}
            disabled={requestingCode}
          >
            <RotateCcw size={17} aria-hidden="true" />
            {requestingCode ? "Generating code…" : "Start inventory reset"}
          </button>
        ) : (
          <form className="reset-confirmation-form" onSubmit={confirmReset}>
            <div className="reset-code-card">
              <div>
                <strong>Security check</strong>
                <p>Enter this code to continue. It expires in five minutes.</p>
              </div>
              <output aria-label="Reset security code">{challenge.code}</output>
            </div>

            <div className="reset-input-grid">
              <Field label="Security code">
                <TextInput
                  value={enteredCode}
                  onChange={(event) => setEnteredCode(event.target.value)}
                  required
                  inputMode="numeric"
                  pattern="[0-9]{6}"
                  maxLength={6}
                  autoComplete="off"
                  placeholder="Enter the six-digit code"
                />
              </Field>
              <Field label='Type "RESET INVENTORY" to confirm'>
                <TextInput
                  value={confirmationText}
                  onChange={(event) => setConfirmationText(event.target.value)}
                  required
                  autoComplete="off"
                  placeholder="RESET INVENTORY"
                />
              </Field>
            </div>

            <div className="reset-actions">
              <button
                type="submit"
                className="reset-confirm-button"
                disabled={
                  resetting ||
                  enteredCode.trim() !== challenge.code ||
                  confirmationText.trim() !== "RESET INVENTORY"
                }
              >
                <Trash2 size={17} aria-hidden="true" />
                {resetting ? "Resetting inventory…" : "Permanently reset inventory"}
              </button>
              <button
                type="button"
                className="reset-cancel-button"
                onClick={cancelChallenge}
                disabled={resetting}
              >
                Cancel
              </button>
            </div>
          </form>
        )}
      </section>
    </>
  );
}

function PasswordResetRequestsPage({ employee, onCountChange }) {
  const [requests, setRequests] = useState([]);
  const [loadingRequests, setLoadingRequests] = useState(true);
  const [busyRequestId, setBusyRequestId] = useState(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const pollingRef = useRef(false);

  const loadRequests = useCallback(async () => {
    if (pollingRef.current) return;
    pollingRef.current = true;
    try {
      const data = await apiRequest(
        "/api/auth/password-reset-requests/review/",
        employee
      );
      const pending = Array.isArray(data) ? data : [];
      setRequests(pending);
      onCountChange(pending.length);
      setError("");
    } catch (err) {
      setError(err.message || "Unable to load password reset requests.");
    } finally {
      pollingRef.current = false;
      setLoadingRequests(false);
    }
  }, [employee, onCountChange]);

  useEffect(() => {
    loadRequests();
    const intervalId = window.setInterval(() => {
      if (document.visibilityState === "visible") loadRequests();
    }, 5000);
    const refreshWhenVisible = () => {
      if (document.visibilityState === "visible") loadRequests();
    };
    window.addEventListener("focus", refreshWhenVisible);
    document.addEventListener("visibilitychange", refreshWhenVisible);

    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener("focus", refreshWhenVisible);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
    };
  }, [loadRequests]);

  async function reviewRequest(requestId, decision) {
    setBusyRequestId(requestId);
    setError("");
    setMessage("");
    try {
      const result = await apiRequest(
        `/api/auth/password-reset-requests/${requestId}/${decision}/`,
        employee,
        { method: "POST" }
      );
      const remaining = requests.filter((entry) => entry.id !== requestId);
      setRequests(remaining);
      onCountChange(remaining.length);
      if (decision === "approve") {
        setMessage(
          result.detail ||
            "Request approved. The one-time password reset code was emailed to the employee."
        );
      } else {
        setMessage(result.detail || "Password reset request denied.");
      }
    } catch (err) {
      setError(err.message || "Unable to review this password reset request.");
    } finally {
      setBusyRequestId(null);
    }
  }

  return (
    <>
      <PageHeading
        title="Password reset requests"
        description="Review employee requests and email a short-lived approval code to the registered address."
        action={
          <button
            type="button"
            style={buttonStyle}
            onClick={() => {
              setLoadingRequests(true);
              setError("");
              loadRequests();
            }}
            disabled={loadingRequests}
          >
            {loadingRequests ? "Refreshing…" : "Refresh requests"}
          </button>
        }
      />
      <Notice message={message} />
      <Notice message={error} error />

      <section style={panelStyle}>
        <SectionTitle
          title="Pending requests"
          subtitle={`${requests.length} request(s) awaiting review`}
        />
        {loadingRequests && requests.length === 0 ? (
          <p>Loading password reset requests…</p>
        ) : (
          <Table
            exportName="password-reset-requests"
            columns={[
              { label: "EMPLOYEE ID", key: "employee_id" },
              {
                label: "EMPLOYEE",
                render: (entry) => entry.full_name || "Name not set",
              },
              { label: "PORTAL", key: "role" },
              {
                label: "REQUESTED",
                render: (entry) => dateTime(entry.requested_at),
              },
              {
                label: "ACTIONS",
                export: false,
                render: (entry) => (
                  <div className="staff-row-actions">
                    <button
                      type="button"
                      style={primaryButton}
                      onClick={() => reviewRequest(entry.id, "approve")}
                      disabled={busyRequestId !== null}
                    >
                      {busyRequestId === entry.id ? "Approving…" : "Approve"}
                    </button>
                    <button
                      type="button"
                      style={buttonStyle}
                      onClick={() => reviewRequest(entry.id, "deny")}
                      disabled={busyRequestId !== null}
                    >
                      Deny
                    </button>
                  </div>
                ),
              },
            ]}
            rows={requests}
            emptyMessage="There are no password reset requests waiting for approval."
          />
        )}
      </section>
    </>
  );
}

/* ADMIN LOGIN HISTORY */

function LoginHistoryPage({ employee }) {
  const [records, setRecords] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");

  const loadHistory = useCallback(async () => {
    if (employee?.role !== "ADMIN") return;

    setLoadingHistory(true);
    setError("");

    try {
      const data = await apiRequest("/api/auth/login-history/", employee);

      setRecords(
        Array.isArray(data)
          ? data
          : Array.isArray(data?.results)
            ? data.results
            : []
      );
    } catch (err) {
      setError(err.message || "Unable to load login history.");
    } finally {
      setLoadingHistory(false);
    }
  }, [employee]);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  const filteredRecords = records.filter((record) => {
    const searchableText = [
      record.employee_id,
      record.username,
      record.ip_address,
      record.status,
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();

    const matchesSearch = searchableText.includes(search.toLowerCase());
    const matchesStatus =
      statusFilter === "ALL" || record.status === statusFilter;

    return matchesSearch && matchesStatus;
  });

  if (employee?.role !== "ADMIN") {
    return (
      <section style={panelStyle}>
        <h2>Access denied</h2>
        <p>Only administrators can view login history.</p>
      </section>
    );
  }

  return (
    <>
      <PageHeading
        title="Login History"
        description="Review successful and failed employee login attempts."
        action={
          <button
            type="button"
            style={buttonStyle}
            onClick={loadHistory}
            disabled={loadingHistory}
          >
            {loadingHistory ? "Refreshing…" : "Refresh history"}
          </button>
        }
      />

      <Notice message={error} error />

      <div style={styles.stats}>
        <StatCard
          title="Total records"
          value={records.length}
          description="Login attempts returned by the backend"
        />
        <StatCard
          title="Successful logins"
          value={records.filter((r) => r.status === "SUCCESS").length}
          description="Successful authentication attempts"
        />
        <StatCard
          title="Failed logins"
          value={records.filter((r) => r.status === "FAILED").length}
          description="Failed authentication attempts"
        />
      </div>

      <section style={panelStyle}>
        <SectionTitle
          title="Employee login records"
          subtitle={`${filteredRecords.length} record(s) shown`}
        />

        <div style={styles.filterRow}>
          <Field label="Search records">
            <TextInput
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Employee ID, username or IP"
            />
          </Field>

          <Field label="Login status">
            <select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
              style={inputStyle}
            >
              <option value="ALL">All statuses</option>
              <option value="SUCCESS">Successful</option>
              <option value="FAILED">Failed</option>
            </select>
          </Field>
        </div>

        {loadingHistory && records.length === 0 ? (
          <p style={{ color: "#A9B8AE" }}>Loading login history…</p>
        ) : (
          <Table
            exportName="login-history"
            columns={[
              {
                label: "EMPLOYEE ID",
                render: (record) => record.employee_id || "Unknown",
              },
              {
                label: "USERNAME",
                render: (record) => record.username || "—",
              },
              {
                label: "STATUS",
                render: (record) => {
                  const successful = record.status === "SUCCESS";

                  return (
                    <span
                      style={{
                        display: "inline-block",
                        padding: "5px 9px",
                        borderRadius: 20,
                        fontSize: 12,
                        fontWeight: 600,
                        color: successful ? "#17683c" : "#a32121",
                        background: successful ? "#e4f6eb" : "#fff0f0",
                      }}
                    >
                      {successful ? "Successful" : "Failed"}
                    </span>
                  );
                },
              },
              {
                label: "IP ADDRESS",
                render: (record) => record.ip_address || "Unavailable",
              },
              {
                label: "DATE & TIME",
                render: (record) => dateTime(record.created_at),
              },
            ]}
            rows={filteredRecords}
            emptyMessage={
              error
                ? "Login history could not be loaded."
                : "No login records match your search."
            }
          />
        )}

        <p style={{ color: "#A9B8AE", fontSize: 12, marginTop: 14 }}>
          Login records are supplied by the Django backend. Only the most
          recent records returned by the backend are displayed.
        </p>
      </section>
    </>
  );
}

function StaffAssistant({ onNavigate }) {
  const [open, setOpen] = useState(false);
  const [question, setQuestion] = useState("");
  const [messages, setMessages] = useState([
    {
      role: "assistant",
      text: "Hi! I can guide you through common inventory tasks. Choose a topic or ask a question.",
    },
  ]);

  const topics = [
    {
      label: "Record a sale",
      keywords: ["sale", "sell", "issue"],
      page: "Sales / Issues",
      text: "Open Sales / Issues, select an active item, enter the quantity and a unique reference, then submit. Stock is reduced when the sale is recorded.",
    },
    {
      label: "Receive a purchase",
      keywords: ["purchase", "receive", "supplier"],
      page: "Purchases",
      text: "Open Purchases, select the item, add the supplier, quantity, unit cost and a unique reference, then submit. Received units are added to stock.",
    },
    {
      label: "Check low stock",
      keywords: ["low stock", "reorder", "stock alert", "out of stock"],
      page: "Dashboard",
      text: "The dashboard lists items at or below their reorder level. Open Items to search the catalog and review each item's current quantity and reorder threshold.",
    },
    {
      label: "Find a stock movement",
      keywords: ["movement", "history", "adjustment"],
      page: "Stock Movements",
      text: "Open Stock Movements to review stock changes, references, quantities and timestamps. Use the filters to narrow the list by item or movement type.",
    },
    {
      label: "Open reports",
      keywords: ["report", "summary", "value"],
      page: "Reports",
      text: "Open Reports for inventory valuation, sales activity and purchase summaries. Use Refresh after recording transactions to load the latest figures.",
    },
  ];

  function respond(text) {
    const normalized = text.toLowerCase();
    const topic = topics.find((entry) =>
      entry.keywords.some((keyword) => normalized.includes(keyword))
    );
    setMessages((previous) => [
      ...previous,
      { role: "user", text },
      topic
        ? { role: "assistant", text: topic.text, page: topic.page }
        : {
            role: "assistant",
            text: "I can help with recording sales, receiving purchases, checking low stock, finding stock movements, and opening reports. Choose one of those topics to see the steps.",
          },
    ]);
    setQuestion("");
  }

  function submitQuestion(event) {
    event.preventDefault();
    const trimmed = question.trim();
    if (trimmed) respond(trimmed);
  }

  return (
    <div className="sp-chatbot">
      {open && (
        <section className="sp-chat-window" role="dialog" aria-label="Staff help assistant">
          <header className="sp-chat-header">
            <div className="sp-chat-title">
              <span className="sp-chat-avatar"><Bot size={18} aria-hidden="true" /></span>
              <div>
                <strong>StockPilot Help</strong>
                <span>Guided staff support</span>
              </div>
            </div>
            <button type="button" className="sp-chat-close" onClick={() => setOpen(false)} aria-label="Close assistant">
              <X size={18} aria-hidden="true" />
            </button>
          </header>
          <div className="sp-chat-messages" aria-live="polite">
            {messages.map((message, index) => (
              <div key={`${message.role}-${index}`}>
                <div className={`sp-chat-message ${message.role === "user" ? "user" : "bot"}`}>
                  {message.text}
                </div>
                {message.page && (
                  <button
                    type="button"
                    className="sp-chat-page-link"
                    onClick={() => onNavigate(message.page)}
                  >
                    Open {message.page}
                  </button>
                )}
              </div>
            ))}
            {messages.length === 1 && (
              <div className="sp-chat-topics">
                {topics.map((topic) => (
                  <button key={topic.label} type="button" onClick={() => respond(topic.label)}>
                    {topic.label}
                  </button>
                ))}
              </div>
            )}
          </div>
          <form className="sp-chat-input-area" onSubmit={submitQuestion}>
            <input
              value={question}
              onChange={(event) => setQuestion(event.target.value)}
              placeholder="Ask about an inventory task"
              aria-label="Ask the staff assistant"
            />
            <button type="submit" aria-label="Send question" disabled={!question.trim()}>
              <Send size={17} aria-hidden="true" />
            </button>
          </form>
        </section>
      )}
      <button
        type="button"
        className="sp-chat-launcher"
        onClick={() => setOpen((previous) => !previous)}
        aria-label={open ? "Close staff assistant" : "Open staff assistant"}
        aria-expanded={open}
      >
        {open ? <X size={23} aria-hidden="true" /> : <MessageCircle size={23} aria-hidden="true" />}
      </button>
    </div>
  );
}

const navigation = [
  "Dashboard",
  "Items",
  "Purchases",
  "Sales / Issues",
  "Stock Movements",
  "Reports",
];

const SESSION_DURATION_MS = 10 * 60 * 1000;

function App() {
  const [employee, setEmployee] = useState(null);
  const [sessionExpiresAt, setSessionExpiresAt] = useState(null);
  const [sessionSecondsLeft, setSessionSecondsLeft] = useState(600);
  const [sessionNotice, setSessionNotice] = useState("");
  const profileMenuRef = useRef(null);
  const [activePage, setActivePage] = useState("Dashboard");
  const [summary, setSummary] = useState(null);
  const [items, setItems] = useState([]);
  const [purchases, setPurchases] = useState([]);
  const [sales, setSales] = useState([]);
  const [movements, setMovements] = useState([]);
  const [pendingResetCount, setPendingResetCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [globalError, setGlobalError] = useState("");

  const handleLogin = useCallback((authenticatedEmployee) => {
    setEmployee(authenticatedEmployee);
    setSessionExpiresAt(Date.now() + SESSION_DURATION_MS);
    setSessionSecondsLeft(SESSION_DURATION_MS / 1000);
    setSessionNotice("");
  }, []);

  const handleLogout = useCallback((notice = "") => {
    setEmployee(null);
    setSessionExpiresAt(null);
    setSessionSecondsLeft(SESSION_DURATION_MS / 1000);
    setSessionNotice(notice);
    setActivePage("Dashboard");
    setSummary(null);
    setItems([]);
    setPurchases([]);
    setSales([]);
    setMovements([]);
    setPendingResetCount(0);
    setGlobalError("");
  }, []);

  useEffect(() => {
    function closeProfileMenu(event) {
      const menu = profileMenuRef.current;
      if (menu?.open && !menu.contains(event.target)) menu.open = false;
    }

    function handleProfileMenuKey(event) {
      if (event.key === "Escape" && profileMenuRef.current?.open) {
        profileMenuRef.current.open = false;
        profileMenuRef.current.querySelector("summary")?.focus();
      }
    }

    document.addEventListener("pointerdown", closeProfileMenu);
    document.addEventListener("keydown", handleProfileMenuKey);
    return () => {
      document.removeEventListener("pointerdown", closeProfileMenu);
      document.removeEventListener("keydown", handleProfileMenuKey);
    };
  }, []);

  useEffect(() => {
    if (!employee || !sessionExpiresAt) return undefined;

    function updateSessionCountdown() {
      const secondsLeft = Math.max(
        0,
        Math.ceil((sessionExpiresAt - Date.now()) / 1000)
      );
      setSessionSecondsLeft(secondsLeft);
      if (secondsLeft === 0) {
        handleLogout("Your session expired after 10 minutes. Please sign in again.");
      }
    }

    const intervalId = window.setInterval(updateSessionCountdown, 1000);
    window.addEventListener("focus", updateSessionCountdown);
    document.addEventListener("visibilitychange", updateSessionCountdown);

    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener("focus", updateSessionCountdown);
      document.removeEventListener("visibilitychange", updateSessionCountdown);
    };
  }, [employee, handleLogout, sessionExpiresAt]);

  const loadDashboard = useCallback(async () => {
    const data = await apiRequest("/api/dashboard/", employee);
    setSummary(data);
  }, [employee]);

  const loadItems = useCallback(async () => {
    const data = await apiRequest("/api/items/", employee);
    setItems(Array.isArray(data) ? data : data.results || []);
  }, [employee]);

  const loadPurchases = useCallback(async () => {
    const data = await apiRequest("/api/purchases/", employee);
    setPurchases(Array.isArray(data) ? data : data.results || []);
  }, [employee]);

  const loadSales = useCallback(async () => {
    const data = await apiRequest("/api/sales/", employee);
    setSales(Array.isArray(data) ? data : data.results || []);
  }, [employee]);

  const loadMovements = useCallback(async () => {
    const data = await apiRequest("/api/stock-movements/", employee);
    setMovements(Array.isArray(data) ? data : data.results || []);
  }, [employee]);

  const refreshAll = useCallback(async () => {
    if (!employee) return;

    setLoading(true);
    setGlobalError("");

    try {
      await Promise.all([
        loadDashboard(),
        loadItems(),
        loadPurchases(),
        loadSales(),
        loadMovements(),
      ]);
    } catch (err) {
      setGlobalError(err.message || "Unable to load inventory data.");
    } finally {
      setLoading(false);
    }
  }, [
    employee,
    loadDashboard,
    loadItems,
    loadPurchases,
    loadSales,
    loadMovements,
  ]);

  useEffect(() => {
    if (employee) refreshAll();
  }, [employee, refreshAll]);

  const updatePendingResetCount = useCallback((count) => {
    setPendingResetCount(count);
  }, []);

  useEffect(() => {
    if (employee?.role !== "ADMIN") return;

    let active = true;
    let checking = false;

    async function checkResetRequests() {
      if (!active || checking || document.visibilityState === "hidden") return;
      checking = true;
      try {
        const data = await apiRequest(
          "/api/auth/password-reset-requests/review/",
          employee
        );
        if (!active) return;

        setPendingResetCount(Array.isArray(data) ? data.length : 0);
      } catch (err) {
        if (active) {
          setGlobalError(
            err.message || "Unable to check password reset requests."
          );
        }
      } finally {
        checking = false;
      }
    }

    checkResetRequests();
    const intervalId = window.setInterval(checkResetRequests, 5000);
    window.addEventListener("focus", checkResetRequests);
    document.addEventListener("visibilitychange", checkResetRequests);

    return () => {
      active = false;
      window.clearInterval(intervalId);
      window.removeEventListener("focus", checkResetRequests);
      document.removeEventListener("visibilitychange", checkResetRequests);
    };
  }, [employee]);

  if (!employee) {
    return <LoginPage onLogin={handleLogin} sessionNotice={sessionNotice} />;
  }

  const refreshPage = async () => {
    await refreshAll();
  };

  const visibleNavigation =
    employee.role === "ADMIN"
      ? [
          ...navigation,
          "Password Reset Requests",
          "Staff Management",
          "Inventory Reset",
          "Login History",
        ]
      : navigation;
  const displayName =
    employee.full_name || employee.employee_id || employee.username || "Employee";
  const displayRole = employee.role === "ADMIN" ? "Administrator" : "Staff";

  return (
    <div style={styles.app}>
      <aside style={styles.sidebar}>
        <div style={styles.brand}>
          <div style={styles.logo}>SP</div>
          <div>
            <div style={{ fontWeight: 800, fontSize: 19 }}>StockPilot</div>
            <div
              style={{
                fontSize: 10,
                letterSpacing: 1.5,
                color: "#91A99A",
              }}
            >
              INVENTORY ERP
            </div>
          </div>
        </div>

        <div style={styles.navLabel}>WORKSPACE</div>

        <nav>
          {visibleNavigation.map((page) => (
            <button
              key={page}
              onClick={() => setActivePage(page)}
              style={{
                ...styles.navButton,
                background:
                  activePage === page ? "#25433F" : "transparent",
                color: activePage === page ? "#ffffff" : "#C8D3DF",
                borderLeft:
                  activePage === page
                    ? "3px solid #167D68"
                    : "3px solid transparent",
              }}
            >
              {page}
              {page === "Items" && (
                <span style={styles.navCount}>{items.length}</span>
              )}
              {page === "Password Reset Requests" &&
                pendingResetCount > 0 && (
                  <span className="password-reset-nav-count">
                    {pendingResetCount}
                  </span>
                )}
            </button>
          ))}
        </nav>

        <div style={styles.sidebarFooter}>
          <div style={{ fontWeight: 700 }}>
            {employee.full_name || employee.employee_id || employee.username || "Employee"}
          </div>
          <div style={{ color: "#91A99A", fontSize: 12 }}>
            {employee.role || "Inventory Staff"}
          </div>
        </div>
      </aside>

      <main style={styles.main}>
        <header style={styles.topbar}>
          <div>
            <strong>StockPilot ERP</strong>
            <div style={{ color: "#A9B8AE", fontSize: 12 }}>
              Inventory workspace
            </div>
          </div>

          <div
            className="session-countdown"
            role="timer"
            aria-label={`Automatic sign-out in ${Math.floor(sessionSecondsLeft / 60)} minutes and ${sessionSecondsLeft % 60} seconds`}
          >
            <Clock3 size={16} aria-hidden="true" />
            <span>Auto sign-out in</span>
            <strong>
              {String(Math.floor(sessionSecondsLeft / 60)).padStart(2, "0")}:
              {String(sessionSecondsLeft % 60).padStart(2, "0")}
            </strong>
          </div>

          <details className="profile-menu" ref={profileMenuRef}>
            <summary aria-label="Open profile and account actions" title="Profile">
              <CircleUserRound size={21} aria-hidden="true" />
              <span>{displayName}</span>
            </summary>
            <div className="profile-popover">
              <div className="profile-popover-heading">
                <div className="profile-avatar" aria-hidden="true">
                  {displayName.slice(0, 1).toUpperCase()}
                </div>
                <div className="profile-identity">
                  <strong>{displayName}</strong>
                  <span>{displayRole}</span>
                </div>
              </div>

              <div className="profile-details">
                <div className="profile-detail">
                  <BadgeCheck size={16} aria-hidden="true" />
                  <span>Employee ID</span>
                  <strong>{employee.employee_id || "—"}</strong>
                </div>
                {employee.email && (
                  <div className="profile-detail">
                    <Mail size={16} aria-hidden="true" />
                    <span>Email</span>
                    <strong>{employee.email}</strong>
                  </div>
                )}
                {employee.mobile_number && (
                  <div className="profile-detail">
                    <Phone size={16} aria-hidden="true" />
                    <span>Mobile</span>
                    <strong>{employee.mobile_number}</strong>
                  </div>
                )}
                {employee.department && (
                  <div className="profile-detail">
                    <Building2 size={16} aria-hidden="true" />
                    <span>Department</span>
                    <strong>{employee.department}</strong>
                  </div>
                )}
                {employee.job_title && (
                  <div className="profile-detail">
                    <BriefcaseBusiness size={16} aria-hidden="true" />
                    <span>Job title</span>
                    <strong>{employee.job_title}</strong>
                  </div>
                )}
                {employee.start_date && (
                  <div className="profile-detail profile-detail-date">
                    <span>Start date</span>
                    <strong>{employee.start_date}</strong>
                  </div>
                )}
              </div>

              <button
                type="button"
                className="profile-signout"
                onClick={() => handleLogout()}
              >
                <LogOut size={17} aria-hidden="true" />
                Sign out
              </button>
            </div>
          </details>
        </header>

        {employee.role === "ADMIN" && pendingResetCount > 0 && (
          <div className="reset-request-banner" role="status" aria-live="polite">
            <div className="reset-request-banner-icon">
              <ShieldAlert size={19} aria-hidden="true" />
            </div>
            <div className="reset-request-banner-copy">
              <strong>
                {pendingResetCount} password reset{" "}
                {pendingResetCount === 1 ? "request needs" : "requests need"} your review
              </strong>
              <span>
                Requests remain here until approved or denied. The count
                refreshes automatically.
              </span>
            </div>
            <button
              type="button"
              className="reset-request-banner-action"
              onClick={() => {
                setActivePage("Password Reset Requests");
              }}
            >
              Review requests
            </button>
          </div>
        )}

        <div className="workspace-content" style={styles.content}>
          <div className="workspace-breadcrumb">
            Workspace / {activePage}
          </div>

          {globalError && <Notice message={globalError} error />}

          {loading && (
            <p className="workspace-loading">
              Refreshing live inventory data…
            </p>
          )}

          {activePage === "Dashboard" && (
            <Dashboard
              summary={summary}
              items={items}
              purchases={purchases}
              sales={sales}
              onNavigate={setActivePage}
              refresh={refreshPage}
            />
          )}

          {activePage === "Items" && (
            <ItemsPage
              items={items}
              employee={employee}
              reload={loadItems}
            />
          )}

          {activePage === "Purchases" && (
            <PurchasesPage
              items={items}
              employee={employee}
              purchases={purchases}
              reload={loadPurchases}
              reloadAll={refreshAll}
            />
          )}

          {activePage === "Sales / Issues" && (
            <SalesPage
              items={items}
              employee={employee}
              sales={sales}
              reload={loadSales}
              reloadAll={refreshAll}
            />
          )}

          {activePage === "Stock Movements" && (
            <MovementsPage
              movements={movements}
              items={items}
              reload={loadMovements}
            />
          )}

          {activePage === "Reports" && (
            <ReportsPage
              items={items}
              purchases={purchases}
              sales={sales}
              movements={movements}
              summary={summary}
              refresh={refreshPage}
            />
          )}

          {activePage === "Login History" && employee.role === "ADMIN" && (
            <LoginHistoryPage employee={employee} />
          )}

          {activePage === "Password Reset Requests" &&
            employee.role === "ADMIN" && (
              <PasswordResetRequestsPage
                employee={employee}
                onCountChange={updatePendingResetCount}
              />
            )}

          {activePage === "Staff Management" && employee.role === "ADMIN" && (
            <StaffManagementPage employee={employee} />
          )}

          {activePage === "Inventory Reset" && employee.role === "ADMIN" && (
            <InventoryResetPage employee={employee} refresh={refreshAll} />
          )}
        </div>
      </main>

      {employee.role === "STAFF" && (
        <StaffAssistant onNavigate={setActivePage} />
      )}

    </div>
  );
}

const styles = {
  app: {
    minHeight: "100vh",
    display: "flex",
    background: "#f4f6f8",
    color: "#24313d",
    fontFamily: "'Aptos', 'Segoe UI', sans-serif",
  },
  sidebar: {
    width: 245,
    flexShrink: 0,
    background: "#172333",
    color: "#ffffff",
    display: "flex",
    flexDirection: "column",
    minHeight: "100vh",
  },
  brand: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    padding: "25px 18px",
    borderBottom: "1px solid #253447",
  },
  logo: {
    width: 42,
    height: 42,
    borderRadius: 11,
    background: "#167d68",
    color: "#ffffff",
    display: "grid",
    placeItems: "center",
    fontWeight: 800,
    fontSize: 17,
    flexShrink: 0,
  },
  navLabel: {
    padding: "23px 20px 10px",
    color: "#a8b6c5",
    fontSize: 10,
    letterSpacing: 1.7,
    fontWeight: 700,
  },
  navButton: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    width: "100%",
    padding: "13px 17px",
    textAlign: "left",
    border: "none",
    cursor: "pointer",
    fontSize: 13,
  },
  navCount: {
    background: "#2a3b50",
    borderRadius: 20,
    padding: "2px 7px",
    fontSize: 11,
  },
  sidebarFooter: {
    marginTop: "auto",
    padding: 20,
    borderTop: "1px solid #253447",
  },
  main: {
    flex: 1,
    minWidth: 0,
  },
  topbar: {
    background: "#ffffff",
    borderBottom: "1px solid #e0e6eb",
    padding: "17px 28px",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 15,
  },
  content: {
    padding: 28,
    maxWidth: 1600,
    margin: "0 auto",
  },
  pageHeading: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 16,
    marginBottom: 22,
    flexWrap: "wrap",
  },
  sectionHeading: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 14,
    marginBottom: 18,
    flexWrap: "wrap",
  },
  stats: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))",
    gap: 15,
    marginBottom: 20,
  },
  formGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
    gap: "0 18px",
  },
  filterRow: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
    gap: 16,
    maxWidth: 650,
  },
  alertRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "13px 0",
    borderBottom: "1px solid #29372E",
  },
  loginPage: {
    minHeight: "100vh",
    display: "grid",
    placeItems: "center",
    padding: 20,
    background: "#f4f6f8",
    fontFamily: "'Aptos', 'Segoe UI', sans-serif",
  },
  loginCard: {
    width: "100%",
    maxWidth: 390,
    boxSizing: "border-box",
    padding: 30,
    background: "#ffffff",
    color: "#24313d",
    border: "1px solid #e0e6eb",
    borderRadius: 8,
    boxShadow: "0 12px 32px rgba(16, 24, 40, 0.1)",
  },
};

export default App;