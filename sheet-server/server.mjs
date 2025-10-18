import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import { GoogleSpreadsheet } from 'google-spreadsheet';
import { OAuth2Client, JWT } from 'google-auth-library';

const app = express();
app.use(express.json()); // Enable JSON body parsing

// for adding to their sheet
const oauthClient = new OAuth2Client({
    clientId: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
});

// for adding the dashboard
const jwtClient = new JWT({
    email: process.env.SERVICE_ACCOUNT_EMAIL,
    key: process.env.SERVICE_ACCOUNT_KEY.replace(/\\n/g, "\n"),
    scopes: [
        'https://www.googleapis.com/auth/spreadsheets',
        'https://www.googleapis.com/auth/drive.file',
        ],
});

app.post('/clear', async (req, res) => {
    try {
        const { workplace_name, file_id, refresh_token, newestDateToClear } = req.body;
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
            return res.json({ new_file_id });
        }
        let sheet = doc.sheetsByTitle["attendance log"];
        if (!sheet) {
            doc.addSheet({ title: "attendance log", headerValues: ['Date', 'Time', 'Name', 'Tag'] });
            return res.json({ new_file_id });
        }

        const rows = await sheet.getRows();
        const rowIndexToClear = [];
        for (const [index, row] of rows.entries()) 
            if (new Date(row.get('Date')) < new Date(newestDateToClear)) 
                rowIndexToClear.push(index);

        const batches = [];
        let currentBatchStart = -1;
        let currentBatchEnd = -1;

        for (let i = rowIndexToClear.length - 1; i >= 0; i--) {
            if (currentBatchStart === -1) {
                currentBatchStart = rowIndexToClear[i];
                currentBatchEnd = rowIndexToClear[i];
            }
            // it's consecutive, so extend the batch's start
            else if (rowIndexToClear[i] === currentBatchStart - 1) 
                currentBatchStart = rowIndexToClear[i];
            else { // Otherwise, the sequence is broken. Finalize the previous batch and start a new one.
                batches.push({
                    start: currentBatchStart,
                    end: currentBatchEnd
                });
                // Start the new batch
                currentBatchStart = rowIndexToClear[i];
                currentBatchEnd = rowIndexToClear[i];
            }
        }
        // After the loop, the last batch needs to be added
        if (currentBatchStart !== -1) 
            batches.push({
                start: currentBatchStart,
                end: currentBatchEnd
            });

        for (const batch of batches) 
            sheet.clearRows({ start: batch.start + 2, end: batch.end + 2 });

        res.json({ new_file_id });
    } catch (error) {
        if (!error.message.includes("429"))
            console.error(error); //log if not generic 429 error
        res.status(429).end();
    }
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
            await doc.share(process.env.SERVICE_ACCOUNT_EMAIL, {role: 'writer'});
            create_dashboard(doc);
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
    } catch (error) {
        if (!error.message.includes("429"))
            console.error(error); //log if not generic 429 error
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
        if (!error.message.includes("429"))
            console.error(error); //log if not generic 429 error
        res.status(429).end();
    }
});

async function create_spreadsheet(workplace_name) {
    const doc = await GoogleSpreadsheet.createNewSpreadsheetDocument(oauthClient, { title: workplace_name + " (created by Atteny)" });
    await doc.share(process.env.SERVICE_ACCOUNT_EMAIL, {role: 'writer'});
    // rename the default Sheet1
    const defaultSheet = doc.sheetsByIndex[0];
    await defaultSheet.updateProperties({ title: "attendance log" });
    await defaultSheet.setHeaderRow(['Date', 'Time', 'Name', 'Tag']);
    create_dashboard(doc);
    return doc;
}

// helper function to copy template to new sheet
// the jwt has both access to the template and the user's sheet
async function create_dashboard(doc) {
    const template_ss = new GoogleSpreadsheet(process.env.TEMPLATE_SS_ID, jwtClient);
    await template_ss.loadInfo();
    template_ss.sheetsByIndex[0].copyToSpreadsheet(doc.spreadsheetId);
    template_ss.sheetsByIndex[1].copyToSpreadsheet(doc.spreadsheetId);
}

app.listen(3000, '127.0.0.1');
