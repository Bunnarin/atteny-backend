require('dotenv').config();

const express = require('express');
const { GoogleSpreadsheet } = require('google-spreadsheet');
const { OAuth2Client } = require('google-auth-library');

const app = express();
app.use(express.json()); // Enable JSON body parsing

// Create a JWT client for authentication.
const oauthClient = new OAuth2Client({
    clientId: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
  });

app.post('/append', async (req, res) => {
    try {
        const { file_id, workplace_name, refresh_token, rows } = req.body;
        oauthClient.credentials.refresh_token = refresh_token;
        let doc = new GoogleSpreadsheet(file_id, oauthClient);
        let new_file_id; //incase we need to create a new one
        try {
            await doc.loadInfo();
        } catch (error) {
            if (error.message.includes("429")) // so that we don't create alot of sheets
                return res.status(429);
            doc = await create_spreadsheet(refresh_token, workplace_name);
            new_file_id = doc.spreadsheetId;
        }
        let sheet = doc.sheetsByTitle[workplace_name + " attendance log"];
        if (!sheet) sheet = await doc.addSheet({ title: workplace_name + " attendance log", headerValues: ['Date', 'Time', 'Name', 'Tag'] });
        try { await sheet.addRows(rows) } 
        catch (error) {
            if (error.message.includes("429")) // so that we don't create alot of sheets
                return res.status(429);
            await sheet.setHeaderRow(['Date', 'Time', 'Name', 'Tag']);
            sheet.addRows(rows);
        }
        res.json({ new_file_id });
    } catch {
        // sht will always be 429
        res.status(429);
    }
});

app.post('/create', async (req, res) => {
    try {
        const { workplace_name, refresh_token } = req.body;
        const {spreadsheetId} = await create_spreadsheet(refresh_token, workplace_name);
        res.json({spreadsheetId});
    } catch (error) {
        console.error(error);
        res.status(500).json({ error });
    }
});

async function create_spreadsheet(refresh_token, workplace_name) {
    oauthClient.credentials.refresh_token = refresh_token;
    const doc = await GoogleSpreadsheet.createNewSpreadsheetDocument(oauthClient, { title: workplace_name + " (created by Atteny)" });
    await doc.addSheet({ title: workplace_name + " attendance log", headerValues: ['Date', 'Time', 'Name', 'Tag'] });
    return doc;
}

app.listen(3000, '127.0.0.1');