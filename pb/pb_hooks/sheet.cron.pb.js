// 20 write/mn (could up to 30, but I want to leave 10 write/mn to delete)
cronAdd("log_attendence", "* * * * *", () => {
    const config = require(`${__hooks}/config.js`);
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
        WHERE w.logs != ''
        ORDER BY LENGTH(w.logs) DESC
        LIMIT 20
    `).all(workplaces);

    // do this to prevent another clockin to comes here and get overwritten while it's being executed (1mn)
    if (workplaces.length)
        $app.db().newQuery(`
            UPDATE workplace
            SET logs = ''
            WHERE id IN ("${workplaces.map(w => w.id).join('", "')}")
        `).execute();

    // helper
    const transformLogsToArray = (logs) => 
        Object.entries(logs).flatMap(([date, tags]) => 
            Object.entries(tags).flatMap(([tag, names]) => 
                Object.entries(names).flatMap(([name, times]) => 
                    times.map(time => [date, time, name, tag])
                )
            )
        );

    for (const [index, workplace] of workplaces.entries()) {
        const rows = transformLogsToArray(JSON.parse(workplace.logs));
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
        if (res.statusCode != 200) { //restore the nulled logs
            const workplacesToRestore = workplaces.slice(index);
            const sqlCases = workplacesToRestore.map(w => `WHEN id = '${w.id}' THEN '${w.logs}'`).join(' ');
            $app.db().newQuery(`
                UPDATE workplace
                SET logs = CASE
                    ${sqlCases}
                END
            `).execute();
            break;
        }

        if (res.json.new_file_id) {
            const record = $app.findRecordById("workplace", workplace.id)
            record.set('file_id', res.json.new_file_id)
            $app.saveNoValidate(record)
        }
    }
})