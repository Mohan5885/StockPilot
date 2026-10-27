import { lazy, Suspense, useCallback, useEffect, useRef, useState } from "react";
import {
  BadgeCheck,
  Bot,
  CircleUserRound,
  Clock3,
  Download,
  LogOut,
  MessageCircle,
  Send,
  ShieldAlert,
  X,
  KeyRound,
} from "lucide-react";
import ChangePasswordDialog from "./ChangePasswordDialog.jsx";
import "./App.css";

const API = (
  import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:8000"
).replace(/\/+$/, "");
const DashboardCharts = lazy(() => import("./DashboardCharts.jsx"));
const reportDate = new Date();
const reportToday = `${reportDate.getFullYear()}-${String(reportDate.getMonth() + 1).padStart(2, "0")}-${String(reportDate.getDate()).padStart(2, "0")}`;
const reportMonthStart = `${reportDate.getFullYear()}-${String(reportDate.getMonth() + 1).padStart(2, "0")}-01`;

const emptyItem = {
  sku: "",
  name: "",
  brand: "",
  model: "",
  category: "",
  warranty: "",
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
  item_name: "",
  brand: "",
  model: "",
  category: "",
  warranty: "",
  quantity: "1",
  unit_cost: "",
  notes: "",
};

const emptySale = {
  reference: "",
  item: "",
  quantity: "1",
  transaction_type: "SALE",
  unit_selling_price: "",
  customer_name: "",
  customer_phone: "",
  notes: "",
};

const emptyStaffForm = {
  employee_id: "",
  full_name: "",
  email: "",
  mobile_number: "",
  department: "",
  job_title: "",
  password: "",
  confirm_password: "",
};

const money = (value) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 2,
  }).format(Number(value || 0));

const unitCostMoney = (value) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
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
    const isHtmlResponse =
      response.headers.get("content-type")?.includes("text/html") ||
      (typeof data === "string" && /<!doctype html|<html[\s>]/i.test(data));
    if (isHtmlResponse) {
      throw new Error(
        `The API returned an HTML error page (HTTP ${response.status}). Check the backend logs and confirm database migrations are applied.`
      );
    }

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
          <Download size={16} aria-hidden="true" />
          <span>Download CSV</span>
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
            <p>A clear, dependable workspace for your operations.</p>
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
                  ? "Sign in with your employee ID and password."
                  : loginMode === "request"
                    ? "An administrator must approve your request before you can reset your password."
                    : "Enter the one-time approval code provided to you by an administrator."}
              </p>
            </div>

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
                  <span>Your role is identified securely from your employee account.</span>
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

function Dashboard({ summary, items, purchases, sales, onNavigate }) {
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
          value={money(
            summary?.inventory_value ?? summary?.known_inventory_value
          )}
          description={
            summary?.unvalued_items > 0
              ? `Known value; ${summary.unvalued_items} stocked item(s) need an opening cost`
              : "Current quantity × weighted-average cost"
          }
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
      brand: item.brand || "",
      model: item.model || "",
      category: item.category || "",
      warranty: item.warranty || "",
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
    `${item.name} ${item.sku} ${item.brand} ${item.model} ${item.category}`
      .toLowerCase()
      .includes(search.toLowerCase())
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

              <Field label="Brand">
                <TextInput
                  value={form.brand}
                  onChange={(e) => change("brand", e.target.value)}
                  placeholder="e.g. Acme"
                />
              </Field>

              <Field label="Model">
                <TextInput
                  value={form.model}
                  onChange={(e) => change("model", e.target.value)}
                  placeholder="Model or product number"
                />
              </Field>

              <Field label="Category">
                <TextInput
                  value={form.category}
                  onChange={(e) => change("category", e.target.value)}
                  placeholder="e.g. Electronics"
                />
              </Field>

              <Field label="Warranty">
                <TextInput
                  value={form.warranty}
                  onChange={(e) => change("warranty", e.target.value)}
                  placeholder="e.g. 12 months"
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
                  {(r.brand || r.model) && (
                    <div style={{ color: "#A9B8AE" }}>
                      {[r.brand, r.model].filter(Boolean).join(" · ")}
                    </div>
                  )}
                  <div style={{ color: "#A9B8AE" }}>{r.description}</div>
                </>
              ),
            },
            { label: "SKU", key: "sku" },
            { label: "CATEGORY", key: "category" },
            { label: "WARRANTY", key: "warranty" },
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
  const addingNewItem = form.item === "other";

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
      const purchase = await apiRequest("/api/purchases/", employee, {
        method: "POST",
        body: JSON.stringify({
          ...form,
          item: addingNewItem ? "other" : Number(form.item),
          quantity: Number(form.quantity),
          unit_cost: Number(form.unit_cost).toFixed(2),
        }),
      });

      setMessage(
        addingNewItem
          ? `New item "${purchase.item_name}" was added to the catalog and the purchase was recorded.`
          : "Purchase recorded. Inventory stock has been increased."
      );
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
            subtitle="Choose an existing item or add a new catalog item and record its purchase in one step."
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
                      {item.name} ({item.sku}){item.brand ? ` · ${item.brand}` : ""} — Stock: {item.quantity}
                    </option>
                  ))}
                  <option value="other">Others — add a new item</option>
                </select>
              </Field>

              {addingNewItem && (
                <>
                  <Field label="New item name">
                    <TextInput
                      value={form.item_name}
                      onChange={(e) => change("item_name", e.target.value)}
                      maxLength={150}
                      required
                    />
                  </Field>
                  <Field label="Brand (optional)">
                    <TextInput
                      value={form.brand}
                      onChange={(e) => change("brand", e.target.value)}
                    />
                  </Field>
                  <Field label="Model (optional)">
                    <TextInput
                      value={form.model}
                      onChange={(e) => change("model", e.target.value)}
                    />
                  </Field>
                  <Field label="Category (optional)">
                    <TextInput
                      value={form.category}
                      onChange={(e) => change("category", e.target.value)}
                    />
                  </Field>
                  <Field label="Warranty (optional)">
                    <TextInput
                      value={form.warranty}
                      onChange={(e) => change("warranty", e.target.value)}
                    />
                  </Field>
                  <p className="purchase-new-item-note">
                    A product code based on the item name is generated
                    automatically. The purchase unit cost is recorded
                    separately; set or update selling price in Items when
                    needed.
                  </p>
                </>
              )}

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
                disabled={busy || (!addingNewItem && !form.item)}
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

            {activeItems.length === 0 && !addingNewItem && (
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
        />

        <Table
          exportName="purchase-history"
          columns={[
            { label: "REFERENCE", key: "reference" },
            { label: "SUPPLIER", key: "supplier_name" },
            {
              label: "ITEM",
              render: (r) =>
                `${r.item_name || "Item"} (${r.item_sku || r.item})${r.item_brand ? ` · ${r.item_brand}` : ""}${r.item_model ? ` ${r.item_model}` : ""}`,
            },
            { label: "QTY", key: "quantity" },
            {
              label: "UNIT COST",
              render: (r) => r.unit_cost == null ? "Restricted" : money(r.unit_cost),
            },
            {
              label: "TOTAL",
              render: (r) => r.total_cost == null
                ? "Restricted"
                : money(r.total_cost),
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
          unit_selling_price:
            form.transaction_type === "SALE"
              ? Number(form.unit_selling_price).toFixed(2)
              : null,
          customer_name:
            form.transaction_type === "SALE" ? form.customer_name.trim() : "",
          customer_phone:
            form.transaction_type === "SALE" ? form.customer_phone.trim() : "",
        }),
      });

      setMessage(
        form.transaction_type === "SALE"
          ? "Sale recorded with its selling price and inventory cost."
          : "Stock issue recorded. Stock has been reduced."
      );
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
            subtitle="Sales record the actual selling price; issues are excluded from revenue."
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

              <Field label="Transaction type">
                <select
                  style={inputStyle}
                  value={form.transaction_type}
                  onChange={(e) => change("transaction_type", e.target.value)}
                >
                  <option value="SALE">Sale</option>
                  <option value="ISSUE">Stock issue (non-revenue)</option>
                </select>
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
                      {item.name} ({item.sku}){item.brand ? ` · ${item.brand}` : ""}{item.model ? ` ${item.model}` : ""} — Available: {item.quantity}
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

              {form.transaction_type === "SALE" && (
                <>
                  <Field label="Customer name">
                    <TextInput
                      value={form.customer_name}
                      onChange={(e) => change("customer_name", e.target.value)}
                      placeholder="Name of the customer"
                      maxLength={150}
                      required
                    />
                  </Field>

                  <Field label="Customer phone number">
                    <TextInput
                      type="tel"
                      inputMode="numeric"
                      pattern="[0-9]{10}"
                      title="Enter exactly 10 digits."
                      value={form.customer_phone}
                      onChange={(e) =>
                        change(
                          "customer_phone",
                          e.target.value.replace(/\D/g, "").slice(0, 10)
                        )
                      }
                      placeholder="Optional contact number"
                      maxLength={10}
                    />
                  </Field>
                </>
              )}

              {form.transaction_type === "SALE" && (
                <Field label="Actual unit selling price (₹)">
                  <TextInput
                    type="number"
                    min="0"
                    step="0.01"
                    value={form.unit_selling_price}
                    onChange={(e) =>
                      change("unit_selling_price", e.target.value)
                    }
                    required
                  />
                </Field>
              )}

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
                {form.transaction_type === "SALE" &&
                  Number(form.unit_selling_price) > 0 && (
                    <>
                      {" "}· Sale total:{" "}
                      <strong>
                        {money(
                          Number(form.quantity) *
                            Number(form.unit_selling_price)
                        )}
                      </strong>
                    </>
                  )}
                {form.transaction_type === "SALE" &&
                  selectedItem.inventory_unit_cost != null && (
                    <>
                      {" "}· Current average inventory cost:{" "}
                      <strong>{unitCostMoney(selectedItem.inventory_unit_cost)}</strong>
                    </>
                  )}
              </p>
            )}

            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button
                type="submit"
                style={primaryButton}
                disabled={busy || activeItems.length === 0}
              >
                {busy ? "Saving…" : `Record ${form.transaction_type === "SALE" ? "sale" : "issue"}`}
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
        />

        <Table
          exportName="sales-issues-history"
          columns={[
            { label: "REFERENCE", key: "reference" },
            { label: "CUSTOMER", key: "customer_name" },
            { label: "PHONE", key: "customer_phone" },
            {
              label: "TYPE",
              render: (r) => r.movement_type === "ISSUE" ? "Stock issue" : "Sale",
            },
            {
              label: "ITEM",
              render: (r) =>
                `${r.item_name || "Item"} (${r.item_sku || r.item})${r.item_brand ? ` · ${r.item_brand}` : ""}${r.item_model ? ` ${r.item_model}` : ""}`,
            },
            { label: "QUANTITY", key: "quantity" },
            {
              label: "UNIT SOLD FOR",
              render: (r) =>
                r.movement_type !== "SALE" || r.unit_selling_price == null
                  ? "—"
                  : money(r.unit_selling_price),
            },
            {
              label: "SALE TOTAL",
              render: (r) =>
                r.movement_type !== "SALE" || r.unit_selling_price == null
                  ? "—"
                  : money(
                      Number(r.quantity) * Number(r.unit_selling_price)
                    ),
            },
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

function MovementsPage({ movements, items }) {
  const [itemFilter, setItemFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [page, setPage] = useState(1);
  const pageSize = 10;

  const filtered = movements.filter((movement) => {
    const itemMatches =
      !itemFilter || String(movement.item) === itemFilter;
    const typeMatches =
      !typeFilter || movement.movement_type === typeFilter;

    return itemMatches && typeMatches;
  });
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, pageCount);
  const pageRows = filtered.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize
  );
  const firstRow = filtered.length === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const lastRow = Math.min(currentPage * pageSize, filtered.length);

  return (
    <>
      <PageHeading
        title="Stock Movements"
        description="Audit the movement of stock into and out of your inventory."
      />

      <section style={panelStyle}>
        <div style={styles.filterRow}>
          <Field label="Filter by item">
            <select
              style={inputStyle}
              value={itemFilter}
              onChange={(e) => {
                setItemFilter(e.target.value);
                setPage(1);
              }}
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
              onChange={(e) => {
                setTypeFilter(e.target.value);
                setPage(1);
              }}
            >
              <option value="">All movements</option>
              <option value="PURCHASE">Purchase / inbound</option>
              <option value="SALE">Sale</option>
              <option value="ISSUE">Stock issue</option>
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
          rows={pageRows}
        />

        <div className="report-pager">
          <span>
            Showing {firstRow} to {lastRow} of {filtered.length}
          </span>
          <div>
            <button
              type="button"
              style={buttonStyle}
              disabled={currentPage <= 1}
              onClick={() => setPage(currentPage - 1)}
            >
              Previous
            </button>
            <button
              type="button"
              style={buttonStyle}
              disabled={currentPage >= pageCount}
              onClick={() => setPage(currentPage + 1)}
            >
              Next
            </button>
          </div>
        </div>
      </section>
    </>
  );
}

function ReportPager({ data, onChange }) {
  if (!data || data.pages <= 1) return null;
  return (
    <div className="report-pager">
      <span>
        Page {data.page} of {data.pages} · {data.count} records
      </span>
      <div>
        <button
          type="button"
          style={buttonStyle}
          disabled={data.page <= 1}
          onClick={() => onChange(data.page - 1)}
        >
          Previous
        </button>
        <button
          type="button"
          style={buttonStyle}
          disabled={data.page >= data.pages}
          onClick={() => onChange(data.page + 1)}
        >
          Next
        </button>
      </div>
    </div>
  );
}

const REPORT_TABS = [
  { id: "sales", label: "Sales report" },
  { id: "purchases", label: "Purchase report" },
  { id: "items", label: "Item report" },
];

function ReportTabs({ activeTab, onSelect }) {
  return (
    <nav className="report-tabs" aria-label="Report type">
      {REPORT_TABS.map((tab) => (
        <button
          key={tab.id}
          type="button"
          className={activeTab === tab.id ? "report-tab is-active" : "report-tab"}
          aria-current={activeTab === tab.id ? "page" : undefined}
          onClick={() => onSelect(tab.id)}
        >
          {tab.label}
        </button>
      ))}
    </nav>
  );
}

function ReportsPage({ employee, items, purchases, sales }) {
  const admin = employee.role === "ADMIN";
  const [activeTab, setActiveTab] = useState("sales");
  const [filters, setFilters] = useState({
    period: "month",
    startDate: reportMonthStart,
    endDate: reportToday,
  });
  const [pages, setPages] = useState({
    inventory_page: 1,
    purchase_page: 1,
    sales_page: 1,
  });
  const [report, setReport] = useState(null);
  const [reportLoading, setReportLoading] = useState(true);
  const [error, setError] = useState("");
  const [reportRefreshKey, setReportRefreshKey] = useState(0);
  const [downloading, setDownloading] = useState("");
  const [openingItem, setOpeningItem] = useState("");
  const [openingCost, setOpeningCost] = useState("");
  const [openingBusy, setOpeningBusy] = useState(false);
  const [openingMessage, setOpeningMessage] = useState("");
  const [openingError, setOpeningError] = useState("");

  useEffect(() => {
    if (!admin) {
      setReportLoading(false);
      return undefined;
    }
    if (
      filters.period === "custom" &&
      (!filters.startDate || !filters.endDate || filters.endDate < filters.startDate)
    ) {
      setReportLoading(false);
      return undefined;
    }
    let active = true;
    let loading = false;

    async function loadReport(silent = false) {
      if (loading) return;
      loading = true;
      if (!silent) setReportLoading(true);
      const query = new URLSearchParams({
        period: filters.period,
        inventory_page: String(pages.inventory_page),
        purchase_page: String(pages.purchase_page),
        sales_page: String(pages.sales_page),
      });
      if (filters.period === "custom") {
        query.set("start_date", filters.startDate);
        query.set("end_date", filters.endDate);
      }
      try {
        const data = await apiRequest(`/api/reports/?${query}`, employee);
        if (active) {
          setReport(data);
          setError("");
        }
      } catch (err) {
        if (active) setError(err.message || "Unable to load reports.");
      } finally {
        loading = false;
        if (active && !silent) setReportLoading(false);
      }
    }

    loadReport();
    const intervalId = window.setInterval(() => {
      if (document.visibilityState === "visible") loadReport(true);
    }, 30000);
    const refreshWhenVisible = () => {
      if (document.visibilityState === "visible") loadReport(true);
    };
    window.addEventListener("focus", refreshWhenVisible);
    document.addEventListener("visibilitychange", refreshWhenVisible);
    return () => {
      active = false;
      window.clearInterval(intervalId);
      window.removeEventListener("focus", refreshWhenVisible);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
    };
  }, [admin, employee, filters, pages, reportRefreshKey]);

  const lowStock = items.filter(
    (item) => item.is_active && Number(item.quantity) <= Number(item.reorder_level)
  );

  async function downloadActiveReport() {
    setDownloading(activeTab);
    setError("");
    try {
      const reportKey = {
        sales: "sales",
        purchases: "purchases",
        items: "inventory",
      }[activeTab];
      const pageParameter = {
        sales: "sales_page",
        purchases: "purchase_page",
        items: "inventory_page",
      }[activeTab];
      let rows;
      if (admin) {
        const allRows = [];
        let page = 1;
        let pageCount = 1;
        while (page <= pageCount) {
          const query = new URLSearchParams({
            period: filters.period,
            page_size: "100",
            inventory_page: "1",
            purchase_page: "1",
            sales_page: "1",
            [pageParameter]: String(page),
          });
          if (filters.period === "custom") {
            query.set("start_date", filters.startDate);
            query.set("end_date", filters.endDate);
          }
          const data = await apiRequest(`/api/reports/?${query}`, employee);
          const resultPage = data[reportKey];
          allRows.push(...resultPage.results);
          pageCount = resultPage.pages;
          page += 1;
        }
        rows = allRows;
      } else if (activeTab === "sales") {
        rows = sales.filter((sale) => sale.movement_type === "SALE");
      } else if (activeTab === "purchases") {
        rows = purchases;
      } else {
        rows = items;
      }

      const columns = {
        sales: [
          ["Reference", (row) => row.reference],
          ["Item", (row) => `${row.item_name || "Item"} (${row.item_sku || row.item || ""})`],
          ["Quantity", (row) => row.quantity],
          ["Unit selling price (INR)", (row) => row.unit_selling_price ?? "Restricted"],
          ["Revenue (INR)", (row) => row.sales_revenue ?? (row.unit_selling_price == null ? "Restricted" : Number(row.quantity) * Number(row.unit_selling_price))],
          ["COGS (INR)", (row) => row.cogs ?? "Restricted"],
          ["Gross profit / loss (INR)", (row) => row.gross_profit ?? "Restricted"],
          ["Date", (row) => row.created_at],
          ["Status", (row) => row.status || "COMPLETED"],
        ],
        purchases: [
          ["Reference", (row) => row.reference],
          ["Supplier", (row) => row.supplier_name],
          ["Item", (row) => `${row.item_name || "Item"} (${row.item_sku || row.item || ""})`],
          ["Quantity", (row) => row.quantity],
          ["Unit cost (INR)", (row) => row.unit_cost ?? "Restricted"],
          ["Total (INR)", (row) => row.total_cost ?? "Restricted"],
          ["Date", (row) => row.received_at],
          ["Status", (row) => row.status || "RECEIVED"],
        ],
        items: [
          ["SKU", (row) => row.sku],
          ["Item", (row) => row.name],
          ["Brand", (row) => row.brand],
          ["Model", (row) => row.model],
          ["Category", (row) => row.category],
          ["Available quantity", (row) => row.quantity],
          ["Reorder level", (row) => row.reorder_level],
          ["Valuation unit cost (INR)", (row) => row.unit_cost ?? row.inventory_unit_cost ?? "Restricted"],
          ["Selling price (INR)", (row) => row.selling_price ?? row.unit_price],
          ["Inventory value (INR)", (row) => row.inventory_value ?? "Restricted"],
          ["Stock status", (row) => row.stock_status || (Number(row.quantity) === 0 ? "OUT OF STOCK" : Number(row.quantity) <= Number(row.reorder_level) ? "LOW STOCK" : "IN STOCK")],
        ],
      }[activeTab];

      const filename = {
        sales: "sales-report",
        purchases: "purchase-report",
        items: "item-report",
      }[activeTab];
      const reportPeriod =
        admin && report
          ? `${report.start_date} to ${report.end_date}`
          : "All available records";
      const generatedAt = new Date().toLocaleString("en-IN");
      const exportColumns = [
        ["Report", () => REPORT_TABS.find((tab) => tab.id === activeTab).label],
        ["Period", () => reportPeriod],
        ["Generated", () => generatedAt],
        ["Currency", () => "INR"],
        ...columns,
      ];
      downloadCsv(
        filename,
        exportColumns.map(([label]) => label),
        rows.map((row) =>
          exportColumns.map(([, value]) => exportText(value(row)))
        )
      );
    } catch (err) {
      setError(err.message || "Unable to download this report.");
    } finally {
      setDownloading("");
    }
  }

  async function initializeOpeningCost(event) {
    event.preventDefault();
    setOpeningBusy(true);
    setOpeningError("");
    setOpeningMessage("");
    try {
      await apiRequest(
        `/api/items/${openingItem}/initialize-cost/`,
        employee,
        {
          method: "POST",
          body: JSON.stringify({ unit_cost: Number(openingCost).toFixed(4) }),
        }
      );
      setOpeningItem("");
      setOpeningCost("");
      setOpeningMessage("Opening stock cost initialized. Historical sales remain unchanged.");
      setReportRefreshKey((value) => value + 1);
    } catch (err) {
      setOpeningError(err.message);
    } finally {
      setOpeningBusy(false);
    }
  }

  if (!admin) {
    return (
      <div className="reports-page">
        <PageHeading
          title="Reports"
          description="Review live sales, purchase, and inventory records."
          action={
            <div className="report-heading-actions">
              <button
                type="button"
                className="report-download-button"
                onClick={downloadActiveReport}
                disabled={Boolean(downloading)}
              >
                <Download size={17} aria-hidden="true" />
                {downloading ? "Preparing…" : "Download report"}
              </button>
              <button
                type="button"
                className="report-print-button"
                onClick={() => window.print()}
              >
                Print report
              </button>
            </div>
          }
        />
        <ReportTabs activeTab={activeTab} onSelect={setActiveTab} />
        {activeTab === "sales" && (
          <section className="report-section" style={panelStyle}>
            <SectionTitle title="Sales report" subtitle="Completed sales and the actual selling prices recorded." />
            <Table
              exportName="sales-report"
              columns={[
                { label: "REFERENCE", key: "reference" },
                { label: "ITEM", render: (row) => `${row.item_name || "Item"} (${row.item_sku || row.item})` },
                { label: "QUANTITY", key: "quantity" },
                { label: "UNIT SOLD FOR", render: (row) => row.unit_selling_price == null ? "—" : money(row.unit_selling_price) },
                { label: "DATE", render: (row) => dateTime(row.created_at) },
              ]}
              rows={sales.filter((sale) => sale.movement_type === "SALE")}
              emptyMessage="No sales have been recorded."
            />
          </section>
        )}
        {activeTab === "purchases" && (
          <section className="report-section" style={panelStyle}>
            <SectionTitle title="Purchase report" subtitle="Received purchase records. Financial cost details follow your access permissions." />
            <Table
              exportName="purchase-report"
              columns={[
                { label: "REFERENCE", key: "reference" },
                { label: "SUPPLIER", key: "supplier_name" },
                { label: "ITEM", render: (row) => `${row.item_name || "Item"} (${row.item_sku || row.item})` },
                { label: "QUANTITY", key: "quantity" },
                { label: "DATE", render: (row) => dateTime(row.received_at) },
              ]}
              rows={purchases}
              emptyMessage="No purchases have been recorded."
            />
          </section>
        )}
        {activeTab === "items" && (
          <>
            <section className="report-section" style={panelStyle}>
              <SectionTitle title="Item report" subtitle="Catalog details, available stock, and reorder status." />
              <Table
                exportName="item-report"
                columns={[
                  { label: "SKU", key: "sku" },
                  { label: "ITEM", key: "name" },
                  { label: "BRAND", key: "brand" },
                  { label: "MODEL", key: "model" },
                  { label: "CATEGORY", key: "category" },
                  { label: "WARRANTY", key: "warranty" },
                  { label: "AVAILABLE", key: "quantity" },
                  { label: "REORDER LEVEL", key: "reorder_level" },
                  { label: "SELLING PRICE", render: (row) => money(row.unit_price) },
                  { label: "STATUS", render: (row) => Number(row.quantity) === 0 ? "OUT OF STOCK" : Number(row.quantity) <= Number(row.reorder_level) ? "LOW STOCK" : "IN STOCK" },
                ]}
                rows={items}
                emptyMessage="No catalog items have been created."
              />
            </section>
            <section className="report-section" style={panelStyle}>
              <SectionTitle title="Items requiring attention" subtitle="Active items at or below their reorder level." />
              <Table
                exportName="low-stock-report"
                columns={[
                  { label: "ITEM", key: "name" },
                  { label: "SKU", key: "sku" },
                  { label: "AVAILABLE", key: "quantity" },
                  { label: "REORDER LEVEL", key: "reorder_level" },
                ]}
                rows={lowStock}
                emptyMessage="All active items are above their reorder levels."
              />
            </section>
          </>
        )}
      </div>
    );
  }

  const summary = report?.summary;
  const inventoryRows = report?.inventory?.results || [];

  return (
    <div className="reports-page">
      <PageHeading
        title="Reports"
        description="Explore filtered sales, purchasing, and inventory performance."
        action={
          <div className="report-heading-actions">
            <button
              type="button"
              className="report-download-button"
              onClick={downloadActiveReport}
              disabled={Boolean(downloading) || reportLoading}
            >
              <Download size={17} aria-hidden="true" />
              {downloading ? "Preparing…" : "Download report"}
            </button>
            <button
              type="button"
              className="report-print-button"
              onClick={() => window.print()}
            >
              Print report
            </button>
          </div>
        }
      />

      <ReportTabs activeTab={activeTab} onSelect={setActiveTab} />

      <section className="report-filter-panel" aria-label="Report date filters">
        <Field label="Reporting period">
          <select
            style={inputStyle}
            value={filters.period}
            onChange={(event) => {
              setReport(null);
              setError("");
              setPages({ inventory_page: 1, purchase_page: 1, sales_page: 1 });
              setFilters((current) => ({
                ...current,
                period: event.target.value,
              }));
            }}
          >
            <option value="today">Today</option>
            <option value="week">This week</option>
            <option value="month">This month</option>
            <option value="year">This year</option>
            <option value="custom">Custom range</option>
          </select>
        </Field>
        {filters.period === "custom" && (
          <>
            <Field label="Start date">
              <TextInput
                type="date"
                value={filters.startDate}
                onChange={(event) => {
                  setReport(null);
                  setPages({ inventory_page: 1, purchase_page: 1, sales_page: 1 });
                  setFilters((current) => ({
                    ...current,
                    startDate: event.target.value,
                  }));
                }}
                required
              />
            </Field>
            <Field label="End date">
              <TextInput
                type="date"
                value={filters.endDate}
                onChange={(event) => {
                  setReport(null);
                  setPages({ inventory_page: 1, purchase_page: 1, sales_page: 1 });
                  setFilters((current) => ({
                    ...current,
                    endDate: event.target.value,
                  }));
                }}
                required
              />
            </Field>
          </>
        )}
        <span className="report-auto-update" role="status">
          Updates automatically
        </span>
      </section>

      {report && (
        <div className="report-meta">
          <span>Period: {report.start_date} to {report.end_date}</span>
          <span>Generated: {dateTime(report.generated_at)} · Currency: INR</span>
        </div>
      )}
      <div className="report-model-note">
        Operating expenses, other income, discounts, taxes, returns, and
        cancellations are not tracked by the current transaction models.
        Net profit is therefore not presented. CSV downloads contain the
        full filtered report; data refreshes automatically.
      </div>
      <Notice message={error} error />
      <Notice message={openingMessage} />
      <Notice message={openingError} error />
      {reportLoading && !report && !error && <p className="workspace-loading" role="status">Loading reports…</p>}

      {report && (
        <>
          {activeTab === "items" && summary.unvalued_items > 0 && (
            <section className="report-section" style={panelStyle}>
              <SectionTitle title="Initialize opening stock cost" subtitle="Provide a documented opening valuation for existing stock with unknown cost. Quantities and historical sales are unchanged." />
              <form className="opening-cost-form" onSubmit={initializeOpeningCost}>
                <Field label="Stock item">
                  <select style={inputStyle} value={openingItem} onChange={(event) => setOpeningItem(event.target.value)} required>
                    <option value="">Select an unvalued item from this page</option>
                    {inventoryRows.filter((row) => row.quantity > 0 && row.unit_cost == null).map((row) => (
                      <option key={row.id} value={row.id}>{row.name} ({row.sku}) — {row.quantity} units</option>
                    ))}
                  </select>
                </Field>
                <Field label="Opening average unit cost (₹)">
                  <TextInput type="number" min="0" step="0.0001" value={openingCost} onChange={(event) => setOpeningCost(event.target.value)} required />
                </Field>
                <button type="submit" style={primaryButton} disabled={openingBusy || !openingItem}>
                  {openingBusy ? "Saving…" : "Initialize cost"}
                </button>
              </form>
            </section>
          )}

          {activeTab === "items" && (
            <>
              <section className="report-section" style={panelStyle}>
                <SectionTitle title="Current item report" subtitle="Catalog information, available units, valuation, and reorder status." />
                <Table
                  exportName="current-stock-report"
                  columns={[
                    { label: "SKU", key: "sku" },
                    { label: "ITEM", key: "name" },
                    { label: "BRAND", key: "brand" },
                    { label: "MODEL", key: "model" },
                    { label: "CATEGORY", key: "category" },
                    { label: "AVAILABLE", key: "quantity" },
                    { label: "REORDER LEVEL", key: "reorder_level" },
                    { label: "UNIT COST", render: (row) => row.unit_cost == null ? "Unknown" : unitCostMoney(row.unit_cost) },
                    { label: "SELLING PRICE", render: (row) => money(row.selling_price) },
                    { label: "INVENTORY VALUE", render: (row) => row.inventory_value == null ? "Unknown" : money(row.inventory_value) },
                    { label: "STATUS", key: "stock_status" },
                  ]}
                  rows={inventoryRows}
                />
                <ReportPager data={report.inventory} onChange={(page) => setPages((current) => ({ ...current, inventory_page: page }))} />
              </section>
            </>
          )}

          {activeTab === "purchases" && (
            <section className="report-section" style={panelStyle}>
              <SectionTitle title="Purchase transactions" subtitle="Received purchase transactions; these are inventory additions, not operating expenses." />
              <Table
                exportName="purchase-report"
                columns={[
                  { label: "REFERENCE", key: "reference" },
                  { label: "SUPPLIER", key: "supplier_name" },
                  { label: "ITEM", render: (row) => `${row.item_name} (${row.item_sku})${row.item_brand ? ` · ${row.item_brand}` : ""}${row.item_model ? ` ${row.item_model}` : ""}` },
                  { label: "QUANTITY", key: "quantity" },
                  { label: "UNIT COST", render: (row) => money(row.unit_cost) },
                  { label: "TOTAL", render: (row) => money(row.total_cost) },
                  { label: "DATE", render: (row) => dateTime(row.received_at) },
                  { label: "STATUS", key: "status" },
                ]}
                rows={report.purchases.results}
              />
              <ReportPager data={report.purchases} onChange={(page) => setPages((current) => ({ ...current, purchase_page: page }))} />
            </section>
          )}

          {activeTab === "sales" && (
            <section className="report-section" style={panelStyle}>
              <SectionTitle title="Sales transactions" subtitle="Selling prices and inventory costs captured when each sale was recorded." />
              <Table
                exportName="sales-report"
                columns={[
                  { label: "REFERENCE", key: "reference" },
                  { label: "CUSTOMER", key: "customer_name" },
                  { label: "PHONE", key: "customer_phone" },
                  { label: "ITEM", render: (row) => `${row.item_name} (${row.item_sku})${row.item_brand ? ` · ${row.item_brand}` : ""}${row.item_model ? ` ${row.item_model}` : ""}` },
                  { label: "QUANTITY", key: "quantity" },
                  { label: "SELLING PRICE", render: (row) => row.unit_selling_price == null ? "Unknown" : money(row.unit_selling_price) },
                  { label: "REVENUE", render: (row) => row.sales_revenue == null ? "Unknown" : money(row.sales_revenue) },
                  { label: "COGS", render: (row) => row.cogs == null ? "Unknown" : money(row.cogs) },
                  { label: "GROSS PROFIT / LOSS", render: (row) => row.gross_profit == null ? "Unavailable" : money(row.gross_profit) },
                  { label: "DATE", render: (row) => dateTime(row.created_at) },
                  { label: "STATUS", key: "status" },
                ]}
                rows={report.sales.results}
              />
              <ReportPager data={report.sales} onChange={(page) => setPages((current) => ({ ...current, sales_page: page }))} />
            </section>
          )}
        </>
      )}
    </div>
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

  const loadStaff = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    setError("");
    try {
      const data = await apiRequest("/api/auth/staff/", employee);
      setStaff(Array.isArray(data) ? data : data.results || []);
    } catch (err) {
      setError(err.message || "Unable to load staff accounts.");
    } finally {
      if (!silent) setLoading(false);
    }
  }, [employee]);

  useEffect(() => {
    loadStaff();
    const intervalId = window.setInterval(() => {
      if (document.visibilityState === "visible") loadStaff(true);
    }, 30000);
    const refreshWhenVisible = () => {
      if (document.visibilityState === "visible") loadStaff(true);
    };
    window.addEventListener("focus", refreshWhenVisible);
    document.addEventListener("visibilitychange", refreshWhenVisible);
    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener("focus", refreshWhenVisible);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
    };
  }, [loadStaff]);

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
      password: "",
      confirm_password: "",
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
    if (!editingStaff && form.password !== form.confirm_password) {
      setError("Password and confirm password do not match.");
      setMessage("");
      return;
    }

    setBusy(true);
    setMessage("");
    setError("");
    const payload = { ...form };
    delete payload.confirm_password;
    if (editingStaff) {
      delete payload.employee_id;
      delete payload.password;
    }

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
                  inputMode="numeric"
                  pattern="[0-9]{10}"
                  title="Enter exactly 10 digits."
                  value={form.mobile_number}
                  onChange={(event) =>
                    updateForm(
                      "mobile_number",
                      event.target.value.replace(/\D/g, "").slice(0, 10)
                    )
                  }
                  required
                  maxLength={10}
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
              {!editingStaff && (
                <>
                  <Field label="Password">
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
                  <Field label="Confirm password">
                    <TextInput
                      type="password"
                      value={form.confirm_password}
                      onChange={(event) =>
                        updateForm("confirm_password", event.target.value)
                      }
                      required
                      autoComplete="new-password"
                      minLength={8}
                    />
                  </Field>
                </>
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
    }, 30000);
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
    const intervalId = window.setInterval(() => {
      if (document.visibilityState === "visible") loadHistory();
    }, 30000);
    const refreshWhenVisible = () => {
      if (document.visibilityState === "visible") loadHistory();
    };
    window.addEventListener("focus", refreshWhenVisible);
    document.addEventListener("visibilitychange", refreshWhenVisible);

    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener("focus", refreshWhenVisible);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
    };
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
      text: "The dashboard health center lists items at or below their reorder level. Open Items to search the catalog and review each item's current quantity and reorder threshold.",
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
      text: "Open Reports for sales, purchasing and inventory analytics. Financial Profit & Loss reports are available to administrators; staff can review current stock and reorder details.",
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

const IDLE_TIMEOUT_SECONDS = 3 * 60;

function App() {
  const [employee, setEmployee] = useState(null);
  const [sessionSecondsLeft, setSessionSecondsLeft] = useState(
    IDLE_TIMEOUT_SECONDS
  );
  const [sessionNotice, setSessionNotice] = useState("");
  const [showChangePassword, setShowChangePassword] = useState(false);
  const profileMenuRef = useRef(null);
  const idleDeadlineRef = useRef(null);
  const dataRefreshInProgressRef = useRef(false);
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
    idleDeadlineRef.current = Date.now() + IDLE_TIMEOUT_SECONDS * 1000;
    setSessionSecondsLeft(IDLE_TIMEOUT_SECONDS);
    setShowChangePassword(false);
    setSessionNotice("");
  }, []);

  const handleLogout = useCallback((notice = "") => {
    setEmployee(null);
    idleDeadlineRef.current = null;
    setSessionSecondsLeft(IDLE_TIMEOUT_SECONDS);
    setShowChangePassword(false);
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
    if (!employee) return undefined;

    function resetIdleDeadline() {
      idleDeadlineRef.current = Date.now() + IDLE_TIMEOUT_SECONDS * 1000;
    }

    function checkIdleDeadline() {
      if (!idleDeadlineRef.current) resetIdleDeadline();
      const secondsLeft = Math.max(
        0,
        Math.ceil((idleDeadlineRef.current - Date.now()) / 1000)
      );
      setSessionSecondsLeft(secondsLeft);
      if (secondsLeft === 0) {
        handleLogout("You were signed out after three minutes of inactivity.");
      }
    }

    const activityEvents = [
      "pointerdown",
      "pointermove",
      "keydown",
      "touchstart",
      "wheel",
      "scroll",
    ];
    activityEvents.forEach((eventName) =>
      window.addEventListener(eventName, resetIdleDeadline, { passive: true })
    );
    const intervalId = window.setInterval(checkIdleDeadline, 1000);
    window.addEventListener("focus", checkIdleDeadline);
    document.addEventListener("visibilitychange", checkIdleDeadline);
    checkIdleDeadline();

    return () => {
      window.clearInterval(intervalId);
      activityEvents.forEach((eventName) =>
        window.removeEventListener(eventName, resetIdleDeadline)
      );
      window.removeEventListener("focus", checkIdleDeadline);
      document.removeEventListener("visibilitychange", checkIdleDeadline);
    };
  }, [employee, handleLogout]);

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

  const refreshAll = useCallback(async (silent = false) => {
    if (!employee || dataRefreshInProgressRef.current) return;

    dataRefreshInProgressRef.current = true;
    if (!silent) {
      setLoading(true);
      setGlobalError("");
    }

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
      dataRefreshInProgressRef.current = false;
      if (!silent) setLoading(false);
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

  useEffect(() => {
    if (!employee) return undefined;
    const refreshWhenVisible = () => {
      if (document.visibilityState === "visible") refreshAll(true);
    };
    const intervalId = window.setInterval(refreshWhenVisible, 30000);
    window.addEventListener("focus", refreshWhenVisible);
    document.addEventListener("visibilitychange", refreshWhenVisible);
    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener("focus", refreshWhenVisible);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
    };
  }, [employee, refreshAll]);

  const updatePendingResetCount = useCallback((count) => {
    setPendingResetCount(count);
  }, []);

  const submitPasswordChange = useCallback(
    (payload) =>
      apiRequest("/api/auth/change-password/", employee, {
        method: "POST",
        body: JSON.stringify(payload),
      }),
    [employee]
  );

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

  const visibleNavigation =
    employee.role === "ADMIN"
      ? [
          ...navigation,
          "Password Reset Requests",
          "Staff Management",
          "Login History",
        ]
      : navigation;
  const displayName =
    employee.full_name || employee.employee_id || employee.username || "Employee";

  return (
    <div style={styles.app}>
      <aside className="app-sidebar" style={styles.sidebar}>
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

      <main className="app-main" style={styles.main}>
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
            aria-label={`Automatic sign-out after inactivity in ${sessionSecondsLeft} seconds`}
          >
            <Clock3 size={16} aria-hidden="true" />
            <span>Auto sign-out in</span>
            <strong>
              {String(Math.floor(sessionSecondsLeft / 60)).padStart(2, "0")}:
              {String(sessionSecondsLeft % 60).padStart(2, "0")}
            </strong>
          </div>

          <details className="profile-menu" ref={profileMenuRef}>
            <summary aria-label={`Profile for ${displayName}`} title="Profile">
              <CircleUserRound size={21} aria-hidden="true" />
              <span>{displayName}</span>
            </summary>
            <div className="profile-popover">
              <div className="profile-popover-heading">
                <div className="profile-identity">
                  <strong>{displayName}</strong>
                </div>
              </div>
              <button
                type="button"
                className="profile-action"
                onClick={() => {
                  profileMenuRef.current.open = false;
                  setShowChangePassword(true);
                }}
              >
                <KeyRound size={17} aria-hidden="true" />
                Change password
              </button>
            </div>
          </details>
          <button
            type="button"
            className="topbar-logout"
            aria-label="Sign out"
            title="Sign out"
            onClick={() => handleLogout()}
          >
            <LogOut size={18} aria-hidden="true" />
          </button>
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
            />
          )}

          {activePage === "Reports" && (
            <ReportsPage
              employee={employee}
              items={items}
              purchases={purchases}
              sales={sales}
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

        </div>
      </main>

      {showChangePassword && (
        <ChangePasswordDialog
          employee={employee}
          onClose={() => setShowChangePassword(false)}
          onSubmit={submitPasswordChange}
        />
      )}

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