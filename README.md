the backend pocketbase + node server for atteny

to apply the migration: ./pocketbase migration up

To cleanup the local migrations history from the deleted migrations, you can run ./pocketbase migrate history-sync

to start the sheet-server, pm2 start npm --name "sheet-server" -- start