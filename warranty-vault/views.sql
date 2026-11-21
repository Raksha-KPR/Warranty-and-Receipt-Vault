-- 1. Warranties expiring in the next 30 days
DROP VIEW IF EXISTS Expiring_Warranties;
CREATE VIEW Expiring_Warranties AS
SELECT p.name AS product, p.brand, w.warranty_type, w.end_date,
       CAST(julianday(w.end_date) - julianday(date('now')) AS INTEGER) AS days_left
FROM Warranty w
JOIN Purchase pu ON w.purchase_id = pu.purchase_id
JOIN Product p   ON pu.product_id = p.product_id
WHERE w.end_date BETWEEN date('now') AND date('now','+30 days');

-- 2. Return windows closing in the next 7 days
DROP VIEW IF EXISTS Return_Window_Closing;
CREATE VIEW Return_Window_Closing AS
SELECT p.name AS product, s.store_name, pu.receipt_no, pu.return_deadline,
       CAST(julianday(pu.return_deadline) - julianday(date('now')) AS INTEGER) AS days_left
FROM Purchase pu
JOIN Product p ON pu.product_id = p.product_id
JOIN Store s   ON pu.store_id = s.store_id
WHERE pu.return_deadline BETWEEN date('now') AND date('now','+7 days');

-- 3. Warranty status: Active / Expiring Soon / Expired
DROP VIEW IF EXISTS Warranty_Status;
CREATE VIEW Warranty_Status AS
SELECT p.name AS product, w.warranty_type, w.start_date, w.end_date,
       CASE
         WHEN w.end_date < date('now') THEN 'Expired'
         WHEN w.end_date <= date('now','+30 days') THEN 'Expiring Soon'
         ELSE 'Active'
       END AS status
FROM Warranty w
JOIN Purchase pu ON w.purchase_id = pu.purchase_id
JOIN Product p   ON pu.product_id = p.product_id;

-- 4. All upcoming expiries in one report
DROP VIEW IF EXISTS All_Upcoming_Expiries;
CREATE VIEW All_Upcoming_Expiries AS
SELECT product, 'Warranty' AS expiry_type, end_date AS expiry_date FROM Expiring_Warranties
UNION
SELECT product, 'Return Window', return_deadline FROM Return_Window_Closing
UNION
SELECT name, 'Product Expiry', expiry_date FROM Product
WHERE expiry_date BETWEEN date('now') AND date('now','+30 days');