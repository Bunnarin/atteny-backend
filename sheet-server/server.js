require('dotenv').config();

const express = require('express');
const { GoogleSpreadsheet } = require('google-spreadsheet');
const { OAuth2Client } = require('google-auth-library');

const app = express();
app.use(express.json()); // Enable JSON body parsing

// Create a JWT client for authentication.
const oauthClient = new OAuth2Client({
    clientId: process.env.PUBLIC_GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
  });

app.post('/clockin', async (req, res) => {
    try {
        const { file_id, sheet_name, refresh_token, name } = req.body;
        oauthClient.credentials.refresh_token = refresh_token;
        const doc = new GoogleSpreadsheet(file_id, oauthClient);
        await doc.loadInfo();
        const timestamp = new Date().toLocaleString("sv", {timeZone: doc.timeZone});
        const log = [timestamp.slice(0, 10), timestamp.slice(11, 16), name];
        let sheet = doc.sheetsByTitle[sheet_name];
        if (!sheet) sheet = await doc.addSheet({ title: sheet_name, headerValues: ['Date', 'Time', 'Name'] });
        try {
            sheet.addRow(log);
        } catch { // it doesnt have header
            sheet.setHeaderRow(["date", "time", "name"]);
            sheet.addRow(log);
        }
        res.json({ success: true, message: "Row added to sheet." });

    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: error });
    }
});

app.post('/approve', async (req, res) => {
    try {
        const { file_id, sheet_name, refresh_token, name, date, reason } = req.body;
        oauthClient.credentials.refresh_token = refresh_token;
        const doc = new GoogleSpreadsheet(file_id, oauthClient);
        await doc.loadInfo();
        const log = [date, reason, name];
        let sheet = doc.sheetsByTitle[sheet_name];
        if (!sheet) sheet = await doc.addSheet({ title: sheet_name, headerValues: ['Date', 'Reason', 'Name'] });
        try {
            sheet.addRow(log);
        } catch { // it doesnt have header
            sheet.setHeaderRow(["date", "reason", "name"]);
            sheet.addRow(log);
        }
        res.json({ success: true, message: "Row added to sheet." });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: error });
    }
});

app.listen(3000, '127.0.0.1');
