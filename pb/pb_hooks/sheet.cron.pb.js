cronAdd("log_attendence", "@hourly", () => {
    const config = require(`${__hooks}/config.js`)
    // get all the workplace where logs isn't empty, order by length
    const workplaces = arrayOf(new DynamicModel({
        "id": "",
        "file_id": "",
        "name": "",
        "logs": "",
        "refresh_token": "",
    }))
    // 30 every 2 mn = 900 every hour if no problem. 1000 if some problematic stuff stalls time
    $app.db().newQuery(`
        SELECT w.id, w.file_id, w.name, w.logs, u.refresh_token
        FROM workplace w
        LEFT JOIN users u ON w.employer = u.id
        WHERE LENGTH(w.logs) > 2
        ORDER BY LENGTH(w.logs) DESC
        LIMIT 1000
    `).all(workplaces);

    // helper
    const transformLogsToArray = (logs) => 
        Object.entries(logs).flatMap(([date, tags]) => 
            Object.entries(tags).flatMap(([tag, names]) => 
                Object.entries(names).flatMap(([name, times]) => 
                    times.map(time => [date, time, name, tag])
                )
            )
        );
    for (const workplace of workplaces) {
        const rows = transformLogsToArray(JSON.parse(workplace.logs))
        const res = $http.send({
            method: "POST",
            url: config.SHEET_SERVER_ENDPOINT() + "/append",
            headers: {"Content-Type": "application/json"},
            body: JSON.stringify({
                file_id: workplace.file_id,
                workplace_name: workplace.name,
                refresh_token: workplace.refresh_token,
                rows,
            }),
        })
        if (res.statusCode == 429) { //the express server will always throw 429
            sleep(60000)
            continue
        }

        const record = $app.findRecordById("workplace", workplace.id)
        // if it created a new spreadsheet, update the file_id
        if (res.json.new_file_id)
            record.set('file_id', res.json.new_file_id)
        record.set("logs", "{}")
        $app.saveNoValidate(record)
    }
})