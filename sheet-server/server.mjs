import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import { GoogleSpreadsheet } from 'google-spreadsheet';
import { OAuth2Client } from 'google-auth-library';

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
                return res.status(429).end();
            doc = await create_spreadsheet(workplace_name);
            new_file_id = doc.spreadsheetId;
        }

        let sheet = doc.sheetsByTitle["attendance log"];
        if (!sheet) {
            sheet = await doc.addSheet({ title: "attendance log", headerValues: ['Date', 'Time', 'Name', 'Tag'] });
            copy_dashboard(doc.spreadsheetId);
        }

        try { 
            await sheet.addRows(rows) 
        } catch (error) {
            // check if 429
            if (error.message.includes("429"))
                return res.status(429).end();
            // the error is no header row
            await sheet.setHeaderRow(['Date', 'Time', 'Name', 'Tag']);
            sheet.addRows(rows);
        }
        res.json({ new_file_id });
    } catch (error) { // sht will always be 429
        console.error(error);
        res.status(429).end();
    }
});

app.post('/create', async (req, res) => {
    try {
        const { workplace_name, refresh_token } = req.body;
        oauthClient.credentials.refresh_token = refresh_token;
        const {spreadsheetId} = await create_spreadsheet(workplace_name);
        res.json({spreadsheetId});
    } catch (error) {
        console.error(error);
        res.status(500).json({ error });
    }
});

async function create_spreadsheet(workplace_name) {
    const doc = await GoogleSpreadsheet.createNewSpreadsheetDocument(oauthClient, { title: workplace_name + " (created by Atteny)" });
    // copy template to new sheet
    await doc.addSheet({ title: "attendance log", headerValues: ['Date', 'Time', 'Name', 'Tag'] });
    copy_dashboard(doc.spreadsheetId);
    return doc;
}

// helper function to copy template to new sheet
async function copy_dashboard(ssId) {
    const template_ss = new GoogleSpreadsheet(process.env.TEMPLATE_SS_ID, oauthClient);
    await template_ss.loadInfo();
    const dashboard_sheet = template_ss.sheetsByIndex[0];
    dashboard_sheet.copyToSpreadsheet(ssId);
    const tag_sheet = template_ss.sheetsByIndex[1];
    tag_sheet.copyToSpreadsheet(ssId);
}

app.listen(3000, '127.0.0.1');