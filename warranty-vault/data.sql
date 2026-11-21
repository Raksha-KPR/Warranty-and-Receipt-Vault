-- Dates are relative to today, so the expiry views always show results in your demo.
INSERT INTO Store (store_name, city) VALUES
('Croma', 'Mangaluru'), ('Reliance Digital', 'Mangaluru'), ('Vijay Sales', 'Bengaluru'),
('Amazon', 'Online'), ('Local Appliances', 'Udupi'), ('Flipkart', 'Online');

INSERT INTO Product (name, brand, category, expiry_date) VALUES
('Smart TV 43 inch', 'Samsung', 'Electronics', NULL),
('Refrigerator', 'LG', 'Appliances', NULL),
('Washing Machine', 'Bosch', 'Appliances', NULL),
('Laptop', 'HP', 'Electronics', NULL),
('Mixer Grinder', 'Philips', 'Kitchen', NULL),
('Smartphone', 'OnePlus', 'Electronics', NULL),
('Air Conditioner', 'Daikin', 'Appliances', NULL),
('Sunscreen Lotion', 'Lakme', 'Personal Care', date('now','+20 days')),
('Headphones', 'Sony', 'Electronics', NULL);

INSERT INTO Purchase (product_id, store_id, purchase_date, price, receipt_no, return_deadline) VALUES
(1, 1, date('now','-340 days'), 35000, 'R1001', date('now','-330 days')),
(2, 2, date('now','-700 days'), 28000, 'R1002', date('now','-690 days')),
(3, 5, date('now','-100 days'), 32000, 'R1003', date('now','-90 days')),
(4, 4, date('now','-2 days'),   55000, 'R1004', date('now','+5 days')),
(5, 5, date('now','-20 days'),   3500, 'R1005', date('now','-10 days')),
(6, 6, date('now','-5 days'),   28000, 'R1006', date('now','+2 days')),
(7, 3, date('now','-30 days'),  42000, 'R1007', date('now','-20 days')),
(8, 2, date('now','-10 days'),    450, 'R1008', NULL),
(9, 4, date('now','-1 days'),    9000, 'R1009', NULL);

-- end_date is filled by trigger
INSERT INTO Warranty (purchase_id, warranty_type, start_date, warranty_months) VALUES
(1, 'Standard', date('now','-340 days'), 12),
(2, 'Standard', date('now','-700 days'), 12),
(2, 'Extended', date('now','-335 days'), 24),
(3, 'Standard', date('now','-100 days'), 24),
(4, 'Standard', date('now','-2 days'),   12),
(5, 'Standard', date('now','-20 days'),   6),
(6, 'Standard', date('now','-5 days'),   12),
(7, 'Standard', date('now','-30 days'),  12),
(9, 'Standard', date('now','-1 days'),    6);

INSERT INTO Service_Record (purchase_id, service_date, issue, cost, status) VALUES
(1, date('now','-120 days'), 'Display flicker', 0, 'Completed'),
(2, date('now','-400 days'), 'Not cooling', 1500, 'Completed'),
(2, date('now','-60 days'),  'Door seal replaced', 800, 'Completed'),
(3, date('now','-30 days'),  'Drum noise', 0, 'In Progress'),
(5, date('now','-5 days'),   'Jar lid broken', 250, 'Pending'),
(7, date('now','-3 days'),   'Remote not working', 0, 'Pending');