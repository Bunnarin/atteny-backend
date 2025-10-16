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
    // rename the default Sheet1
    const defaultSheet = doc.sheetsByIndex[0];
    await defaultSheet.updateProperties({ title: "attendance log" });
    await defaultSheet.setHeaderRow(['Date', 'Time', 'Name', 'Tag']);
    create_dashboard(doc);
    return doc;
}

// helper function to copy template to new sheet
async function create_dashboard(doc) {
    const dashboard_sheet = await doc.addSheet({ title: "attendance dashboard", headerValues: ['Please do not edit this sheet directly. Ctrl+A, Ctrl+C, Ctrl+shift+V to copy to another sheet']});
    dashboard_sheet.addRows([
        ['name', 'A', `=IFERROR(TRANSPOSE(SORT(UNIQUE(FILTER('attendance log'!A2:A999, 'attendance log'!A2:A999<>"")))),)`],
        [
            `=IFERROR(UNIQUE(FILTER('attendance log'!C2:C1000, 'attendance log'!C2:C1000<>"")),)`,
            `=ARRAYFORMULA(BYROW(C3:AL101, LAMBDA(row, IF(COUNTIF(row, "A")=0, "", COUNTIF(row, "A")))))`,
            `=ARRAYFORMULA(BYCOL(C2:AG2, 
                  LAMBDA(date_col, 
                    IF(date_col="",,
                      BYROW(A3:A102, 
                        LAMBDA(name_row, 
                          IF(name_row="",, 
                              IFERROR(TEXTJOIN(CHAR(10), TRUE, 
                                FILTER(
                                  'attendance log'!B2:B999, 
                                  'attendance log'!A2:A999 = date_col, 
                                  'attendance log'!C2:C999 = name_row
                                )
                              ), "A")
                          )
                        )
                      )
                    )
                  )
                ))`
        ]
    ]);
    await dashboard_sheet.resize({ rowCount: 100, columnCount: 33 });
    await dashboard_sheet.loadCells('A2:AG2');
    // now we color the headerrow
    for (let i = 0; i < 33; i++) {
        const cell = dashboard_sheet.getCell(1, i);
        // sht does not work and only give me blue color
        cell.backgroundColor = {
            red: 245,
            green: 73,
            blue: 39,
        };
        // cell.numberFormat = {
        //     type: "DATE",
        //     pattern: "mmmm d dddd"
        // };
    }
    dashboard_sheet.saveUpdatedCells();
}

app.listen(3000, '127.0.0.1');
