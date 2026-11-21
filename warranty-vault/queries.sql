.headers on
.mode column

-- Q1: Warranties expiring in 30 days
SELECT * FROM Expiring_Warranties;

-- Q2: Return windows closing in 7 days
SELECT * FROM Return_Window_Closing;

-- Q3: Warranty status of everything
SELECT * FROM Warranty_Status ORDER BY end_date;

-- Q4: All upcoming expiries
SELECT * FROM All_Upcoming_Expiries ORDER BY expiry_date;

-- Q5: Total spending per category
SELECT p.category, COUNT(*) AS items, SUM(pu.price) AS total_spent
FROM Purchase pu JOIN Product p ON pu.product_id = p.product_id
GROUP BY p.category ORDER BY total_spent DESC;

-- Q6: Products with the most service visits
SELECT p.name, COUNT(sr.service_id) AS visits, SUM(sr.cost) AS total_cost
FROM Service_Record sr
JOIN Purchase pu ON sr.purchase_id = pu.purchase_id
JOIN Product p   ON pu.product_id = p.product_id
GROUP BY p.name ORDER BY visits DESC;

-- Q7: Service history of one product (Refrigerator)
SELECT p.name, sr.service_date, sr.issue, sr.cost, sr.status
FROM Service_Record sr
JOIN Purchase pu ON sr.purchase_id = pu.purchase_id
JOIN Product p   ON pu.product_id = p.product_id
WHERE p.name = 'Refrigerator';

-- Q8: Purchases from each store with total amount
SELECT s.store_name, COUNT(*) AS purchases, SUM(pu.price) AS total
FROM Purchase pu JOIN Store s ON pu.store_id = s.store_id
GROUP BY s.store_name;

-- Q9: Products with no warranty record (subquery)
SELECT name FROM Product
WHERE product_id IN (
  SELECT product_id FROM Purchase
  WHERE purchase_id NOT IN (SELECT purchase_id FROM Warranty));

-- Q10: Purchases whose service cost exceeds 5% of price
SELECT p.name, pu.price, SUM(sr.cost) AS service_cost
FROM Purchase pu
JOIN Product p ON pu.product_id = p.product_id
JOIN Service_Record sr ON sr.purchase_id = pu.purchase_id
GROUP BY pu.purchase_id
HAVING SUM(sr.cost) > 0.05 * pu.price;