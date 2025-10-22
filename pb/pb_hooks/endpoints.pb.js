routerAdd("POST", "/clockin/{id}", (e) => {
    const { date, time, tag } = e.requestInfo().body;
    const name = e.auth.get('nickname') || e.auth.get('name');
    const workplace = $app.findRecordById('workplace', e.request.pathValue("id"));
    const logs = JSON.parse(workplace.get('logs')) || {};
    // magic line to create nested objects if they dont exist
    (logs[date] ??= {})[tag] ??= {[name]: logs[date]?.[tag]?.[name] ?? []};
    logs[date][tag][name].push(time);
    workplace.set('logs', JSON.stringify(logs));
    $app.saveNoValidate(workplace);
    return e.json(200);
}, $apis.requireAuth())

routerAdd("POST", "/approve-leave/{workplace_id}", e => {
    const { employee_id, remark, startDate, endDate } = e.requestInfo().body;
    const workplace = $app.findRecordById('workplace', e.request.pathValue("workplace_id"));
    // make sure that the auth is the employer
    if (workplace.get('employer') != e.auth.get('id'))
        return e.json(403)
    const employee = $app.findRecordById('users', employee_id);
    const logs = JSON.parse(workplace.get('logs')) || {};
    const name = employee.get('nickname') || employee.get('name');

    const currentDate = new Date(startDate);
    const finalDate = new Date(endDate);
    do {
        const date = currentDate.toLocaleDateString('en-CA');
        // magic line to create nested objects if they dont exist
        (logs[date] ??= {})['P'] ??= {[name]: logs[date]?.['P']?.[name] ?? []};
        logs[date]['P'][name].push(remark || 'P');
        currentDate.setDate(currentDate.getDate() + 1);
    } while (currentDate < finalDate);

    workplace.set('logs', JSON.stringify(logs));
    $app.saveNoValidate(workplace);
    return e.json(200)
}, $apis.requireAuth())

// when a user subscribes to a workplace (not added by the employer)
routerAdd("POST", "/subscribe/{id}", (e) => {
    const workplace = $app.findRecordById('workplace', e.request.pathValue("id"));
    if (!workplace)
        return e.json(404);
    
    if (workplace.get('employees').includes(e.auth.get('id')))
        return e.json(200, { "message": "already subscribed" });

    // add the user to the workplace
    workplace.set('employees+', e.auth.get('id'));
    // the workplace onValidate will enforce the max_employee limit
    $app.save(workplace);
    return e.json(200);
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
