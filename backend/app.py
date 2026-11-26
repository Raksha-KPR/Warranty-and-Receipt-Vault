from contextlib import contextmanager
import csv
from datetime import date, timedelta
import io
from pathlib import Path
import sqlite3

from flask import Flask, jsonify, request, Response
from flask_cors import CORS


BACKEND_DIR = Path(__file__).resolve().parent
DATABASE_PATH = BACKEND_DIR / "vault.db"
SQL_DIR = BACKEND_DIR.parent / "warranty-vault"

app = Flask(__name__)
CORS(app, resources={r"/api/*": {"origins": "*"}})


@contextmanager
def database():
    connection = sqlite3.connect(DATABASE_PATH)
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA foreign_keys = ON")
    try:
        yield connection
        connection.commit()
    except Exception:
        connection.rollback()
        raise
    finally:
        connection.close()


def initialize_database():
    if DATABASE_PATH.exists() and DATABASE_PATH.stat().st_size:
        return

    with database() as connection:
        for filename in ("schema.sql", "triggers.sql", "data.sql", "views.sql"):
            connection.executescript((SQL_DIR / filename).read_text(encoding="utf-8"))


def json_body():
    body = request.get_json(silent=True)
    if not isinstance(body, dict):
        return None, (jsonify(error="A JSON object is required."), 400)
    return body, None


def compute_return_deadline(purchase_date_str, return_days=7):
    if return_days in (None, ""):
        return None
    try:
        days = int(return_days)
        if days < 0:
            return None
        year, month, day = map(int, str(purchase_date_str)[:10].split("-"))
        return (date(year, month, day) + timedelta(days=days)).isoformat()
    except (ValueError, TypeError):
        return None


@app.errorhandler(sqlite3.IntegrityError)
def handle_integrity_error(error):
    return jsonify(error=str(error)), 400


@app.errorhandler(sqlite3.DatabaseError)
def handle_database_error(error):
    app.logger.exception("Database request failed")
    return jsonify(error=str(error)), 500


@app.get("/api/purchases")
def get_purchases():
    with database() as connection:
        rows = connection.execute(
            """
            SELECT pu.purchase_id, pu.product_id, pu.store_id, pu.purchase_date,
                   pu.price, pu.receipt_no, pu.return_deadline,
                   p.name AS product_name, p.brand, p.category,
                   s.store_name, s.city,
                   w.warranty_id, w.warranty_type, w.start_date,
                   w.warranty_months, w.end_date,
                   (SELECT COUNT(*) FROM Service_Record sr
                    WHERE sr.purchase_id = pu.purchase_id) AS service_count
            FROM Purchase pu
            JOIN Product p ON p.product_id = pu.product_id
            JOIN Store s ON s.store_id = pu.store_id
            LEFT JOIN Warranty w ON w.purchase_id = pu.purchase_id
            ORDER BY pu.purchase_id DESC, w.end_date DESC, w.warranty_id DESC
            """
        ).fetchall()

    purchases = {}
    for row in rows:
        purchase_id = row["purchase_id"]
        if purchase_id not in purchases:
            purchases[purchase_id] = {
                "id": purchase_id,
                "product_id": row["product_id"],
                "store_id": row["store_id"],
                "product_name": row["product_name"],
                "brand": row["brand"],
                "category": row["category"],
                "store_name": row["store_name"],
                "city": row["city"],
                "purchase_date": row["purchase_date"],
                "price": row["price"],
                "receipt_no": row["receipt_no"],
                "return_deadline": row["return_deadline"],
                "warranty_expiry": row["end_date"],
                "service_count": row["service_count"],
                "warranties": [],
            }
        if row["warranty_id"] is not None:
            purchases[purchase_id]["warranties"].append(
                {
                    "id": row["warranty_id"],
                    "type": row["warranty_type"],
                    "start_date": row["start_date"],
                    "warranty_months": row["warranty_months"],
                    "end_date": row["end_date"],
                }
            )
    return jsonify(list(purchases.values()))


@app.post("/api/purchases")
def create_purchase():
    body, error = json_body()
    if error:
        return error

    required = (
        "product_name",
        "category",
        "store_name",
        "purchase_date",
        "price",
        "warranty_type",
        "warranty_months",
    )
    missing = [field for field in required if body.get(field) in (None, "")]
    if missing:
        return jsonify(error=f"Missing required fields: {', '.join(missing)}"), 400

    try:
        price = float(body["price"])
        warranty_months = int(body["warranty_months"])
    except (TypeError, ValueError):
        return jsonify(error="Price and warranty_months must be numeric."), 400

    return_deadline = compute_return_deadline(
        body["purchase_date"],
        body.get("return_days", 7),
    )

    with database() as connection:
        store = connection.execute(
            "SELECT store_id FROM Store WHERE store_name = ? AND city IS ? LIMIT 1",
            (body["store_name"], body.get("city")),
        ).fetchone()
        if store is None:
            cursor = connection.execute(
                "INSERT INTO Store (store_name, city) VALUES (?, ?)",
                (body["store_name"], body.get("city")),
            )
            store_id = cursor.lastrowid
        else:
            store_id = store["store_id"]

        product = connection.execute(
            """
            SELECT product_id FROM Product
            WHERE name = ? AND brand IS ? AND category = ?
            LIMIT 1
            """,
            (body["product_name"], body.get("brand"), body["category"]),
        ).fetchone()
        if product is None:
            cursor = connection.execute(
                "INSERT INTO Product (name, brand, category) VALUES (?, ?, ?)",
                (body["product_name"], body.get("brand"), body["category"]),
            )
            product_id = cursor.lastrowid
        else:
            product_id = product["product_id"]

        cursor = connection.execute(
            """
            INSERT INTO Purchase
                (product_id, store_id, purchase_date, price, receipt_no, return_deadline)
            VALUES (?, ?, ?, ?, ?, ?)
            """,
            (
                product_id,
                store_id,
                body["purchase_date"],
                price,
                body.get("receipt_no") or None,
                return_deadline,
            ),
        )
        purchase_id = cursor.lastrowid

        connection.execute(
            """
            INSERT INTO Warranty
                (purchase_id, warranty_type, start_date, warranty_months)
            VALUES (?, ?, ?, ?)
            """,
            (
                purchase_id,
                body["warranty_type"],
                body.get("warranty_start_date") or body["purchase_date"],
                warranty_months,
            ),
        )

    return jsonify(purchase_id=purchase_id, return_deadline=return_deadline), 201


@app.patch("/api/purchases/<int:purchase_id>")
def update_purchase(purchase_id):
    body, error = json_body()
    if error:
        return error

    purchase_updates = []
    purchase_params = []

    if "price" in body and body["price"] not in (None, ""):
        try:
            purchase_updates.append("price = ?")
            purchase_params.append(float(body["price"]))
        except (TypeError, ValueError):
            return jsonify(error="Price must be numeric."), 400

    if "receipt_no" in body:
        purchase_updates.append("receipt_no = ?")
        purchase_params.append(body["receipt_no"] or None)

    if "purchase_date" in body and body["purchase_date"]:
        purchase_updates.append("purchase_date = ?")
        purchase_params.append(body["purchase_date"])

    if "return_deadline" in body:
        purchase_updates.append("return_deadline = ?")
        purchase_params.append(body["return_deadline"] or None)

    warranty_updates = []
    warranty_params = []

    if "warranty_type" in body and body["warranty_type"]:
        warranty_updates.append("warranty_type = ?")
        warranty_params.append(body["warranty_type"])

    if "warranty_months" in body and body["warranty_months"] not in (None, ""):
        try:
            months = int(body["warranty_months"])
            if months < 1:
                return jsonify(error="Warranty months must be at least 1."), 400
            warranty_updates.append("warranty_months = ?")
            warranty_params.append(months)
        except (TypeError, ValueError):
            return jsonify(error="Warranty months must be numeric."), 400

    if not purchase_updates and not warranty_updates:
        return jsonify(error="No updatable fields provided."), 400

    with database() as connection:
        existing = connection.execute(
            "SELECT purchase_id FROM Purchase WHERE purchase_id = ?",
            (purchase_id,),
        ).fetchone()
        if existing is None:
            return jsonify(error="Purchase not found."), 404

        if purchase_updates:
            connection.execute(
                f"UPDATE Purchase SET {', '.join(purchase_updates)} WHERE purchase_id = ?",
                [*purchase_params, purchase_id],
            )

        if warranty_updates:
            connection.execute(
                f"UPDATE Warranty SET {', '.join(warranty_updates)} WHERE purchase_id = ?",
                [*warranty_params, purchase_id],
            )

    return jsonify(updated=True, id=purchase_id), 200


@app.delete("/api/purchases/<int:purchase_id>")
def delete_purchase(purchase_id):
    with database() as connection:
        existing = connection.execute(
            "SELECT purchase_id FROM Purchase WHERE purchase_id = ?",
            (purchase_id,),
        ).fetchone()
        if existing is None:
            return jsonify(error="Purchase not found."), 404

        connection.execute(
            "DELETE FROM Service_Record WHERE purchase_id = ?",
            (purchase_id,),
        )
        connection.execute(
            "DELETE FROM Warranty WHERE purchase_id = ?",
            (purchase_id,),
        )
        connection.execute(
            "DELETE FROM Purchase WHERE purchase_id = ?",
            (purchase_id,),
        )
    return jsonify(deleted=True, id=purchase_id), 200


@app.get("/api/expiring")
def get_expiring():
    with database() as connection:
        warranties = connection.execute(
            "SELECT * FROM Expiring_Warranties ORDER BY end_date"
        ).fetchall()
        return_windows = connection.execute(
            "SELECT * FROM Return_Window_Closing ORDER BY return_deadline"
        ).fetchall()
    return jsonify(
        warranties=[dict(row) for row in warranties],
        return_windows=[dict(row) for row in return_windows],
    )


@app.get("/api/purchases/<int:purchase_id>/services")
def get_services(purchase_id):
    with database() as connection:
        rows = connection.execute(
            """
            SELECT service_id AS id, service_date AS date, issue, cost, status
            FROM Service_Record
            WHERE purchase_id = ?
            ORDER BY service_date DESC, service_id DESC
            """,
            (purchase_id,),
        ).fetchall()
    return jsonify([dict(row) for row in rows])


@app.post("/api/purchases/<int:purchase_id>/services")
def create_service(purchase_id):
    body, error = json_body()
    if error:
        return error
    missing = [field for field in ("service_date", "issue") if not body.get(field)]
    if missing:
        return jsonify(error=f"Missing required fields: {', '.join(missing)}"), 400

    with database() as connection:
        cursor = connection.execute(
            """
            INSERT INTO Service_Record (purchase_id, service_date, issue, cost, status)
            VALUES (?, ?, ?, ?, ?)
            """,
            (
                purchase_id,
                body["service_date"],
                body["issue"],
                body.get("cost", 0),
                body.get("status", "Pending"),
            ),
        )
        service_id = cursor.lastrowid
        service = connection.execute(
            """
            SELECT service_id AS id, service_date AS date, issue, cost, status
            FROM Service_Record WHERE service_id = ?
            """,
            (service_id,),
        ).fetchone()
    return jsonify(dict(service)), 201


@app.patch("/api/services/<int:service_id>")
def update_service(service_id):
    body, error = json_body()
    if error:
        return error

    allowed_statuses = {"Pending", "In Progress", "Completed"}
    updates = []
    params = []

    if "status" in body:
        if body["status"] not in allowed_statuses:
            return jsonify(error="Invalid status value."), 400
        updates.append("status = ?")
        params.append(body["status"])

    if "cost" in body:
        try:
            updates.append("cost = ?")
            params.append(float(body["cost"]))
        except (TypeError, ValueError):
            return jsonify(error="Cost must be numeric."), 400

    if not updates:
        return jsonify(error="No updatable fields provided."), 400

    params.append(service_id)
    with database() as connection:
        existing = connection.execute(
            "SELECT service_id FROM Service_Record WHERE service_id = ?",
            (service_id,),
        ).fetchone()
        if existing is None:
            return jsonify(error="Service record not found."), 404

        connection.execute(
            f"UPDATE Service_Record SET {', '.join(updates)} WHERE service_id = ?",
            params,
        )
        updated = connection.execute(
            """
            SELECT service_id AS id, service_date AS date, issue, cost, status
            FROM Service_Record WHERE service_id = ?
            """,
            (service_id,),
        ).fetchone()
    return jsonify(dict(updated)), 200


@app.delete("/api/services/<int:service_id>")
def delete_service(service_id):
    with database() as connection:
        row = connection.execute(
            "SELECT purchase_id FROM Service_Record WHERE service_id = ?",
            (service_id,),
        ).fetchone()
        if row is None:
            return jsonify(error="Service record not found."), 404

        purchase_id = row["purchase_id"]
        connection.execute(
            "DELETE FROM Service_Record WHERE service_id = ?",
            (service_id,),
        )
    return jsonify(deleted=True, id=service_id, purchase_id=purchase_id), 200


@app.get("/api/export.csv")
def export_csv():
    with database() as connection:
        rows = connection.execute(
            """
            SELECT pu.purchase_id, p.name AS product_name, p.brand, p.category,
                   s.store_name, s.city, pu.purchase_date, pu.price,
                   pu.receipt_no, pu.return_deadline,
                   MAX(w.end_date) AS warranty_expiry,
                   (SELECT COUNT(*) FROM Service_Record sr
                    WHERE sr.purchase_id = pu.purchase_id) AS service_count,
                   (SELECT COALESCE(SUM(sr.cost), 0) FROM Service_Record sr
                    WHERE sr.purchase_id = pu.purchase_id) AS total_service_cost
            FROM Purchase pu
            JOIN Product p ON p.product_id = pu.product_id
            JOIN Store s ON s.store_id = pu.store_id
            LEFT JOIN Warranty w ON w.purchase_id = pu.purchase_id
            GROUP BY pu.purchase_id
            ORDER BY pu.purchase_id DESC
            """
        ).fetchall()

    buffer = io.StringIO()
    writer = csv.writer(buffer)
    writer.writerow(
        [
            "ID",
            "Product",
            "Brand",
            "Category",
            "Store",
            "City",
            "Purchase Date",
            "Price",
            "Receipt No",
            "Return Deadline",
            "Warranty Expiry",
            "Service Count",
            "Total Service Cost",
        ]
    )
    for r in rows:
        writer.writerow(
            [
                r["purchase_id"],
                r["product_name"],
                r["brand"] or "",
                r["category"],
                r["store_name"],
                r["city"] or "",
                r["purchase_date"],
                r["price"],
                r["receipt_no"] or "",
                r["return_deadline"] or "",
                r["warranty_expiry"] or "",
                r["service_count"],
                r["total_service_cost"],
            ]
        )

    return Response(
        buffer.getvalue(),
        mimetype="text/csv",
        headers={"Content-Disposition": "attachment; filename=vault_ledger.csv"},
    )


initialize_database()


if __name__ == "__main__":
    app.run(debug=True, port=5000)