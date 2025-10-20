routerAdd("POST", "/clockin/{id}", (e) => {
    const { date, time, tag } = e.requestInfo().body;
    const name = e.auth.get('nickname') || e.auth.get('name');
    const workplace = $app.findRecordById('workplace', e.request.pathValue("id"));
    const logs = JSON.parse(workplace.get('logs')) || {};
    logs[date] ??= {};
    logs[date][tag] ??= {};
    logs[date][tag][name] ??= [];
    logs[date][tag][name].push(time);
    workplace.set('logs', JSON.stringify(logs));
    $app.saveNoValidate(workplace);
    return e.json(200);
}, $apis.requireAuth())

routerAdd("POST", "/approve-leave/{workplace_id}", e => {
    const config = require(`${__hooks}/config.js`);
    const { employee_id, remark, startDate, endDate } = e.requestInfo().body;
    const workplace = $app.findRecordById('workplace', e.request.pathValue("workplace_id"));
    // make sure that the auth is the employer
    if (workplace.get('employer') != e.auth.get('id'))
        return e.json(403)
    const employee = $app.findRecordById('users', employee_id);

    const currentDate = new Date(startDate);
    const finalDate = new Date(endDate);
    const rows = [];
    while (currentDate < finalDate) {
        rows.push([
            currentDate.toLocaleDateString('en-CA'), 
            remark || "P",
            employee.get('nickname') || employee.get('name'), 
            "P"
        ]);
        currentDate.setDate(currentDate.getDate() + 1);
    }
    // push it one last time incase finalDate was null and we needed to include the final date anw
    rows.push([
        currentDate.toLocaleDateString('en-CA'), 
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
    if (res.json.new_file_id) {
        workplace.set('file_id', res.json.new_file_id)
        $app.saveNoValidate(workplace)
    }
    return e.json(200)
}, $apis.requireAuth())

// when a user subscribes to a workplace (not added by the employer)
routerAdd("POST", "/subscribe/{id}", (e) => {
    const workplace = $app.findRecordById('workplace', e.request.pathValue("id"));
    if (!workplace)
        return e.json(404);
    
    if (workplace.get('employees').includes(e.auth.get('id')))
        return e.json(200, { "message": "already subscribed" })

    // add the user to the workplace
    workplace.set('employees+', e.auth.get('id'))
    // the workplace onValidate will enforce the max_employee limit
    $app.save(workplace)
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

routerAdd("POST", "/clear-attendance/{workplace_id}", e => {
    const config = require(`${__hooks}/config.js`);
    const { newestDateToClear } = e.requestInfo().body;
    const workplace = $app.findRecordById('workplace', e.request.pathValue("workplace_id"));
    // ensure that the user is the employer
    if (workplace.get('employer') != e.auth.get('id'))
        return e.json(403)
    
    const res = $http.send({
        method: "POST",
        url: config.SHEET_SERVER_ENDPOINT() + "/clear",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({
            file_id: workplace.get('file_id'),
            refresh_token: e.auth.get('refresh_token'),
            newestDateToClear,
        }),
    })
    if (res.statusCode != 200) 
        return e.json(res.statusCode)

    return e.json(200)
}, $apis.requireAuth())
