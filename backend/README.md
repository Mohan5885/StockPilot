# Backend email configuration

Password reset approval codes are sent to the email address on the employee's
account. Configure Django's SMTP backend in `backend/.env` before admins
approve reset requests. The console email backend is the development default
and does not deliver messages to inboxes; approvals are rejected while that
backend is active.

Set these values for the SMTP provider:

```dotenv
EMAIL_BACKEND=django.core.mail.backends.smtp.EmailBackend
EMAIL_HOST=smtp.example.com
EMAIL_PORT=587
EMAIL_HOST_USER=your-smtp-username
EMAIL_HOST_PASSWORD=your-smtp-password
EMAIL_USE_TLS=true
EMAIL_USE_SSL=false
EMAIL_TIMEOUT=10
DEFAULT_FROM_EMAIL=StockPilot <no-reply@example.com>
```

Use credentials from your mail provider, keep `.env` private, and choose TLS or
SSL according to that provider's SMTP settings. Each approval code expires
after 15 minutes and is sent only once.

# Inventory costing and reports

The authenticated `GET /api/reports/` endpoint returns the current-stock,
purchase, and sales reports plus Profit & Loss metrics. Access to that endpoint
is limited to employees whose profile role is `ADMIN`; the Reports navigation
continues to show non-financial stock and reorder information to staff.
Supported periods are `today`, `week`, `month`, `year`, and `custom` (with
`start_date` and `end_date` in `YYYY-MM-DD`). Report dates use the configured
Django timezone (`Asia/Kolkata` in the current settings). Inventory, purchase,
and sales tables use `inventory_page`, `purchase_page`, and `sales_page`;
`page_size` is limited to 100.

Inventory valuation uses a perpetual moving weighted-average unit cost.
Purchase receipt updates that average only when the existing stock already has
a known cost; if the prior quantity has no cost basis, the cost remains
unknown rather than assigning a fabricated value. Each newly recorded sale
stores the actual unit selling price and the current average unit cost on its
stock movement. Stock issues are recorded separately and are not counted as
sales. Sales with missing historic prices or costs are reported as incomplete;
gross profit and margin are withheld until the selected period is complete.
Expenses, discounts, tax, returns, and cancellations are not represented by
current models, so this module does not report net profit or claim to make
those adjustments.

## Migration and existing records

Migration `0003_item_inventory_cost_initialized_at_and_more` adds nullable
inventory-cost and sale-snapshot fields, an explicit stock-issue movement
choice, and indexes transaction timestamps. It does not delete or rewrite
existing items, purchases, or stock movements. Existing stock with no known
cost and past sales with no captured sale price remain `NULL` and are not
backfilled from the current selling price or unrelated purchase totals.

An administrator can initialize the average cost for an existing stocked item
once through `POST /api/items/{id}/initialize-cost/` with
`{"unit_cost":"625.0000"}`. This records the admin and timestamp without
changing stock quantities or revising historical sales. Use a verified
opening valuation from the business records; do not estimate missing costs.
Future received purchases and sales then use the moving-average method.

## Validation and deployment

From the repository root, run:

```powershell
.\backend\venv\Scripts\python.exe .\backend\manage.py test inventory
.\backend\venv\Scripts\python.exe .\backend\manage.py check
npm --prefix frontend run build
npm --prefix frontend run lint
```

For PythonAnywhere, first take a verified backup of the existing database and
confirm the deployed working tree and virtualenv. Then, in the backend
virtualenv, inspect and apply the additive migration:

```bash
python manage.py migrate --plan
python manage.py migrate
```

Do not run inventory reset/flush commands as part of deployment. Build the
frontend with `npm run build` in `frontend/`, deploy the generated `dist/`
through the project's existing frontend/static-file setup, and reload the
PythonAnywhere web app after the backend is updated. Existing API URL and
authentication configuration remain unchanged.
