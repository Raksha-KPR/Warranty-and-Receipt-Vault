# Warranty Vault

This project contains the SQLite database in `warranty-vault/`, a Flask API in
`backend/`, and a React + Vite frontend in `warranty-vault-frontend/`.

## Run the backend

From the project root:

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
python app.py
```

The first backend start creates `backend/vault.db` from `schema.sql`,
`triggers.sql`, `data.sql`, and `views.sql`. The database is kept on subsequent
starts. To rebuild the demo database, stop the backend and delete
`backend/vault.db` before starting it again.

The API listens on `http://localhost:5000`. SQLite foreign-key enforcement is
enabled for each database connection, and Flask CORS is enabled for `/api/*`.

## Run the frontend

In another terminal, from the project root:

```powershell
cd warranty-vault-frontend
npm install
npm run dev
```

Open the URL printed by Vite (normally `http://localhost:5173`). The Vite
development server proxies `/api` requests to the Flask backend.

## API

- `GET /api/purchases` — purchases with product, store, warranty, and service-count data
- `POST /api/purchases` — creates or reuses a store and product, then inserts a purchase and warranty
- `GET /api/expiring` — expiring warranty and return-window view rows
- `GET /api/purchases/<id>/services` — service history for a purchase
- `POST /api/purchases/<id>/services` — adds a service record

For purchase creation, submit `warranty_months`; leave the return deadline
unset. The SQLite triggers populate `Warranty.end_date` and
`Purchase.return_deadline`.
