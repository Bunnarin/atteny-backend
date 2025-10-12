routerAdd("POST", "/clockin/{id}", (e) => {
    const config = require(`${__hooks}/config.js`);
    const { timezone, tag } = e.requestInfo().body;
    const [today, time] = new Date().toLocaleString('fr-BE', { timezone: timezone }).slice(0, 17).split(', ')
    const name = e.auth.get('nickname') || e.auth.get('name')

    const workplace = $app.findRecordById('workplace', e.request.pathValue("id"))
    $app.expandRecord(workplace, ["employer"]);
    const employer = workplace.expandedOne('employer');

    if (employer.get('live_mode')) {
        const row = [today, time, name, tag];

        const free_trial = !employer.get('paid_live_mode');
        if (free_trial) {
            row.push("(This is a demo. In the future, it will take at least an hour for the clock-in to appear. Enable live mode to get update in real time)")
            employer.set('live_mode', false);
            $app.saveNoValidate(employer);
        }
        
        const res = $http.send({
            method: "POST",
            url: config.SHEET_SERVER_ENDPOINT() + "/append",
            headers: {"Content-Type": "application/json"},
            body: JSON.stringify({
                workplace_name: workplace.get('name'),
                file_id: workplace.get('file_id'),
                refresh_token: employer.get('refresh_token'),
                rows: [row],
            }),
        })
        if (res.statusCode != 200) 
            return e.json(res.statusCode)

        if (res.json.new_file_id) {
            workplace.set('file_id', res.json.new_file_id)
            $app.saveNoValidate(workplace)
        }
        
        return e.json(200)
    }
    
    // add to the workplace's log if no live mode
    const logs = JSON.parse(workplace.get('logs')) || {};
    // init the logs if it doesn't exist
    logs[today] ??= {};
    logs[today][tag] ??= {};
    logs[today][tag][name] ??= [];
    logs[today][tag][name].push(time);
    workplace.set('logs', JSON.stringify(logs));
    $app.saveNoValidate(workplace);
    return e.json(200);
}, $apis.requireAuth())

routerAdd("POST", "/approve-leave/{workplace_id}", e => {
    const config = require(`${__hooks}/config.js`)
    const { employee_id, remark, startDate, endDate } = e.requestInfo().body;
    const workplace = $app.findRecordById('workplace', e.request.pathValue("workplace_id"));
    // make sure that the auth is the employer
    if (workplace.get('employer') != e.auth.get('id'))
        return e.json(403)
    const employee = $app.findRecordById('users', employee_id);

    const currentDate = new Date(startDate);
    const finalDate = new Date(endDate);
    const rows = [];
    while (currentDate <= finalDate) {
        rows.push([
            currentDate.toDateString(), 
            remark || "P",
            employee.get('nickname') || employee.get('name'), 
            "P"
        ]);
        currentDate.setDate(currentDate.getDate() + 1);
    }
    // push it one last time incase finalDate was null and we needed to include the final date anw
    rows.push([
            currentDate.toDateString(), 
            remark || "P",
            employee.get('nickname') || employee.get('name'), 
            "P"
        ]);

    const res = $http.send({
        method: "POST",
        url: config.SHEET_SERVER_ENDPOINT() + "/append",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({
            workplace_name: workplace.get('name'),
            file_id: workplace.get('file_id'),
            refresh_token: e.auth.get('refresh_token'),
            rows,
        }),
    })
    if (res.statusCode != 200) 
        return e.json(res.statusCode)

    return e.json(200)
}, $apis.requireAuth())

// when a user subscribes to a workplace (not added by the employer)
routerAdd("POST", "/subscribe/{id}", (e) => {
    const workplace = $app.findRecordById('workplace', e.request.pathValue("id"))
    if (workplace.get('employees').includes(e.auth.get('id')))
        return e.json(200, { "message": "already subscribed" })

    // add the user to the workplace
    workplace.set('employees+', e.auth.get('id'))
    // the workplace onValidate will enforce the max_employee limit
    $app.save(workplace)
    return e.json(200)
}, $apis.requireAuth())

routerAdd("POST", "/toggle-live-mode", (e) => {
    if (!e.auth.get('paid_live_mode'))
        return e.json(403)

    e.auth.set('live_mode', !e.auth.get('live_mode'))
    $app.saveNoValidate(e.auth)
    return e.json(200)
}, $apis.requireAuth())

// endpoint to set the nickname of employees
routerAdd("POST", "/set-nickname", (e) => {
    const { employees } = e.requestInfo().body;
    // Im too fking lazy to update in batch
    employees.forEach(({email, nickname}) => 
        $app.db().newQuery(`
            UPDATE users SET nickname = {:nickname} WHERE email = {:email}
        `).bind({ nickname, email }).execute());
    
    return e.json(200)
}, $apis.requireAuth())
