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
    // 150 every 2 mn = 4500 every hour
    $app.db().newQuery(`
        SELECT w.id, w.file_id, w.name, w.logs, u.refresh_token
        FROM workplace w
        LEFT JOIN users u ON w.employer = u.id
        WHERE LENGTH(w.logs) > 2
        ORDER BY LENGTH(w.logs) DESC
        LIMIT 3000
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
    const start = Date.now();
    console.log(start)
    for (let i=0; i<1500; i++)
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
            timeout: 300,
        })
        if (res.statusCode == 429) // the express server can only throw 429
            sleep(60000)

        const record = $app.findRecordById("workplace", workplace.id)
        // if it created a new spreadsheet, update the file_id
        if (res.json.new_file_id)
            record.set('file_id', res.json.new_file_id)
        record.set("logs", "{}")
        $app.saveNoValidate(record)
    }
    console.log('end')
    console.log(Date.now() - start)
})