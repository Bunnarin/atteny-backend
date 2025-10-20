import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import { GoogleSpreadsheet } from 'google-spreadsheet';
import { OAuth2Client, JWT } from 'google-auth-library';
import { google } from 'googleapis';

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
        const { file_id, refresh_token, newestDateToClear } = req.body;
        oauthClient.credentials.refresh_token = refresh_token;
        let doc = new GoogleSpreadsheet(file_id, oauthClient);
        try { await doc.loadInfo() }
        catch { return res.status(200).end() }
        let sheet = doc.sheetsByTitle["attendance log"];
        if (!sheet) 
            return res.status(200).end();

        const rows = await sheet.getRows(); //doesnt include header
        // the assumption is that the row go from oldest to newest
        const targetDate = new Date(newestDateToClear);
        // if last row already sasitfy condition, we clear all
        const lastRow = rows[rows.length - 1];
        if (new Date(lastRow.get('Date')) < targetDate) {
            google.sheets({ version: 'v4', auth: oauthClient }).spreadsheets.batchUpdate({
                spreadsheetId: file_id,
                resource: { requests: [
                    { insertDimension: { range: {
                        sheetId: sheet.sheetId, 
                        dimension: 'ROWS', 
                        startIndex: rows.length + 1, 
                        endIndex: rows.length + 1 + rows.length,
                    } } },
                    { deleteDimension: { range: {
                        sheetId: sheet.sheetId, 
                        dimension: 'ROWS', 
                        startIndex: 1, //to avoid the header 
                        endIndex: rows.length + 1, // rows is 0-based while the api is 1-based cuz we dont count the header
                    } } },
                ] } 
            } );
            return res.status(200).end();
        }

        // we delete the moment we find a row that is older than newestDateToClear
        // if it's a leave, then we run risk of it stopping our delete early
        for (let i = 0; i < rows.length; i++) 
            if (new Date(rows[i].get('Date')) >= targetDate && rows[i].get('Tag') !== 'P') {
                google.sheets({ version: 'v4', auth: oauthClient }).spreadsheets.batchUpdate({
                    spreadsheetId: file_id,
                    resource: { requests: [
                        { insertDimension: { range: {
                            sheetId: sheet.sheetId, 
                            dimension: 'ROWS', 
                            startIndex: rows.length + 1, 
                            endIndex: rows.length + 1 + i,
                        } } },
                        { deleteDimension: { range: {
                            sheetId: sheet.sheetId, 
                            dimension: 'ROWS', 
                            startIndex: 1, //to avoid the header 
                            endIndex: i + 1, // rows is 0-based while the api is 1-based cuz we dont count the header
                        } } },
                    ] } 
                } );
                break;
            }

        res.status(200).end();
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
            await sheet.addRows(rows);
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
