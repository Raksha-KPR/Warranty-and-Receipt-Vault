-- Auto-calculate warranty end_date from start_date + warranty_months
DROP TRIGGER IF EXISTS trg_warranty_end_date;
CREATE TRIGGER trg_warranty_end_date
AFTER INSERT ON Warranty
FOR EACH ROW
BEGIN
    UPDATE Warranty
    SET end_date = date(NEW.start_date, '+' || NEW.warranty_months || ' months')
    WHERE warranty_id = NEW.warranty_id;
END;

-- Auto-set return_deadline (7 days after purchase) if not given
DROP TRIGGER IF EXISTS trg_return_deadline;
CREATE TRIGGER trg_return_deadline
AFTER INSERT ON Purchase
FOR EACH ROW
WHEN NEW.return_deadline IS NULL
BEGIN
    UPDATE Purchase
    SET return_deadline = date(NEW.purchase_date, '+7 days')
    WHERE purchase_id = NEW.purchase_id;
END;