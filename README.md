# StockPilot local development

StockPilot is a Django REST API and React/Vite frontend. The frontend uses
`VITE_API_BASE_URL` and defaults to `http://127.0.0.1:8000`, so local
development works without pointing at the production service.

## Start the backend (PowerShell)

From the repository root:

```powershell
python -m venv backend\venv
backend\venv\Scripts\python.exe -m pip install -r backend\requirements.txt
if (-not (Test-Path backend\.env)) { Copy-Item backend\.env.example backend\.env }
backend\venv\Scripts\python.exe backend\manage.py migrate
backend\venv\Scripts\python.exe backend\manage.py runserver 127.0.0.1:8000
```

If `backend\.env` already exists, do not overwrite it; keep its local values
private. For a new local database, create an administrator and staff account
using Django admin or the existing account-management APIs. The database is
stored at `backend\db.sqlite3`.

## Start the frontend

In a second PowerShell window:

```powershell
if (-not (Test-Path frontend\.env.local)) { Copy-Item frontend\.env.example frontend\.env.local }
Set-Location frontend
npm install
npm run dev -- --host 127.0.0.1
```

Open the URL printed by Vite (normally `http://127.0.0.1:5173`). To use another
backend, set `VITE_API_BASE_URL` in `frontend\.env.local` and restart Vite.
Never put credentials or secrets in the frontend environment.

## Apply database changes safely

Before applying inventory schema changes to any database with important data,
make a verified backup. From the repository root:

```powershell
backend\venv\Scripts\python.exe backend\manage.py migrate --plan
backend\venv\Scripts\python.exe backend\manage.py migrate
```

Migrations add nullable or blank item detail fields and preserve existing
inventory, purchase, and sales records.

## Deploy safely to PythonAnywhere

1. Back up the production SQLite database and verify the backup before
   deploying. Keep the existing production `.env`, database path, and secret
   key; do not replace them with the local examples.
2. Build the frontend with `VITE_API_BASE_URL` set to
   `https://mohan049.pythonanywhere.com` (or the configured production API
   origin). Do not use the local `.env.local` value for a production build.
3. In the PythonAnywhere Bash console, activate the existing virtual
   environment, change to the backend project directory, and run
   `python manage.py migrate` followed by `python manage.py check`.
4. Deploy the built frontend assets and reload the web app from the
   PythonAnywhere Web tab. Confirm login, API requests, and reports after
   reload.

The migrations are additive; they do not delete or replace existing
production records. Apply them only after the backup is verified.

## Validation

```powershell
backend\venv\Scripts\python.exe backend\manage.py test accounts inventory
Set-Location frontend
npm run build
npm run lint
```
