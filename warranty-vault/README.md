# Warranty and Receipt Vault (SQLite)

A database that stores purchases, receipts, warranty periods, return deadlines and service history
for household products, with views that show warranties and return windows expiring soon.

## Run
Install SQLite, then in the project folder:
    sh run_all.sh
Or run each file in order: schema.sql, triggers.sql, data.sql, views.sql, queries.sql

## Tables
Store, Product, Purchase, Warranty, Service_Record

## Triggers
- trg_warranty_end_date: end_date = start_date + warranty_months
- trg_return_deadline: default return_deadline = purchase_date + 7 days

## Views
Expiring_Warranties, Return_Window_Closing, Warranty_Status, All_Upcoming_Expiries