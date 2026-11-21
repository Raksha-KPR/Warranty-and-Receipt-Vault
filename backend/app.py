from contextlib import contextmanager
from pathlib import Path
import sqlite3

from flask import Flask, jsonify, request
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
            VALUES (?, ?, ?, ?, ?, NULL)
            """,
            (
                product_id,
                store_id,
                body["purchase_date"],
                price,
                body.get("receipt_no") or None,
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

    return jsonify(purchase_id=purchase_id), 201


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


initialize_database()


if __name__ == "__main__":
    app.run(debug=True, port=5000)
