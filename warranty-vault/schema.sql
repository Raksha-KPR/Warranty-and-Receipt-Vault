-- Warranty and Receipt Vault (SQLite)
PRAGMA foreign_keys = ON;

DROP TABLE IF EXISTS Service_Record;
DROP TABLE IF EXISTS Warranty;
DROP TABLE IF EXISTS Purchase;
DROP TABLE IF EXISTS Product;
DROP TABLE IF EXISTS Store;

CREATE TABLE Store (
    store_id    INTEGER PRIMARY KEY AUTOINCREMENT,
    store_name  TEXT NOT NULL,
    city        TEXT
);

CREATE TABLE Product (
    product_id   INTEGER PRIMARY KEY AUTOINCREMENT,
    name         TEXT NOT NULL,
    brand        TEXT,
    category     TEXT NOT NULL,
    expiry_date  TEXT            -- optional, only for perishable items
);

CREATE TABLE Purchase (
    purchase_id      INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id       INTEGER NOT NULL,
    store_id         INTEGER NOT NULL,
    purchase_date    TEXT NOT NULL,
    price            REAL NOT NULL CHECK (price >= 0),
    receipt_no       TEXT UNIQUE,
    return_deadline  TEXT,
    FOREIGN KEY (product_id) REFERENCES Product(product_id),
    FOREIGN KEY (store_id)   REFERENCES Store(store_id)
);

CREATE TABLE Warranty (
    warranty_id      INTEGER PRIMARY KEY AUTOINCREMENT,
    purchase_id      INTEGER NOT NULL,
    warranty_type    TEXT NOT NULL CHECK (warranty_type IN ('Standard','Extended')),
    start_date       TEXT NOT NULL,
    warranty_months  INTEGER NOT NULL CHECK (warranty_months > 0),
    end_date         TEXT,       -- filled automatically by trigger
    FOREIGN KEY (purchase_id) REFERENCES Purchase(purchase_id)
);

CREATE TABLE Service_Record (
    service_id    INTEGER PRIMARY KEY AUTOINCREMENT,
    purchase_id   INTEGER NOT NULL,
    service_date  TEXT NOT NULL,
    issue         TEXT,
    cost          REAL DEFAULT 0,
    status        TEXT CHECK (status IN ('Pending','In Progress','Completed')),
    FOREIGN KEY (purchase_id) REFERENCES Purchase(purchase_id)
);