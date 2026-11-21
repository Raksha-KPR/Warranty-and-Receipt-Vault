#!/bin/sh
# Builds the database and runs all demo queries
rm -f vault.db
sqlite3 vault.db < schema.sql
sqlite3 vault.db < triggers.sql
sqlite3 vault.db < data.sql
sqlite3 vault.db < views.sql
sqlite3 vault.db < queries.sql