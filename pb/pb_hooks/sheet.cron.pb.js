// 20 write/mn (could up to 30, but I want to leave 10 write/mn to approve leave and delete)
cronAdd("log_attendence", "* * * * *", () => {
    const config = require(`${__hooks}/config.js`)
    // get all the workplace where logs isn't empty, order by length
    const workplaces = arrayOf(new DynamicModel({
        "id": "",
        "file_id": "",
        "name": "",
        "logs": "",
        "refresh_token": "",
    }))
    $app.db().newQuery(`
        SELECT w.id, w.file_id, w.name, w.logs, u.refresh_token
        FROM workplace w
        LEFT JOIN users u ON w.employer = u.id
        WHERE w.logs IS NOT NULL
        ORDER BY LENGTH(w.logs) DESC
        LIMIT 20
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
        const rows = transformLogsToArray(JSON.parse(workplace.logs) || {});
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
        if (res.statusCode == 429)
            return;

        const record = $app.findRecordById("workplace", workplace.id)
        // if it created a new spreadsheet, update the file_id
        if (res.json.new_file_id)
            record.set('file_id', res.json.new_file_id)
        record.set("logs", "")
        $app.saveNoValidate(record)
    }
})