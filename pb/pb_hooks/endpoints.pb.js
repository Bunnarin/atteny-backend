routerAdd("POST", "/clockin/{id}", (e) => {
    const config = require(`${__hooks}/config.js`)

    // validate that the user is an employee of the workplace
    const workplace = $app.findRecordById('workplace', e.request.pathValue("id"))
    if (!workplace.get('employees').includes(e.auth.id)) 
        return e.json(400, { "error": "You are not authorized to clock in for this workplace" })

    const { timezone } = e.requestInfo().body //passed from the frontend
    const [today, time] = new Date().toLocaleString('fr-BE', { timezone: timezone }).slice(0, 17).split(', ')

    // check if there's any rules and find the rule that matches this time
    const convertToMinutes = (timeStr) => {
        const [hours, minutes] = timeStr.split(':').map(Number);
        return hours * 60 + minutes;
    }
    const isBetween = (timeStr, startStr, endStr) => {
        const timeMn = convertToMinutes(timeStr);
        const startMn = convertToMinutes(startStr);
        const endMn = convertToMinutes(endStr);
        if (endMn > startMn) //daytime
            return timeMn > startMn && timeMn < endMn;
        else //nighttime
            return timeMn < startMn && timeMn > endMn;
    }
    
    const rules = JSON.parse(workplace.get('rules'))
    const matchingRule = rules.find(rule => isBetween(time, rule.s, rule.e));
    if (rules.length && !matchingRule) 
        return e.json(400, { "error": "Clock-in is not allowed at this time" })
    // insert into the sheet if live mode
    const name = e.auth.get('nickname') || e.auth.get('name')
    const tag = matchingRule ? matchingRule.n : ""

    if (e.auth.get('live_mode')) {
        const row = [today, time, name, tag]

        const free_trial = !e.auth.get('paid_live_mode')
        if (free_trial) {
            row.push("(This is a demo. In the future, it will take at least an hour for the clock-in to appear. Enable live mode to get update in real time)")
            e.auth.set('live_mode', false)
            $app.saveNoValidate(e.auth)
        }
        
        const res = $http.send({
            method: "POST",
            url: config.SHEET_SERVER_ENDPOINT() + "/append",
            headers: {"Content-Type": "application/json"},
            body: JSON.stringify({
                file_id: workplace.get('file_id'),
                workplace_name: workplace.get('name'),
                refresh_token: e.auth.get('refresh_token'),
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
    const logs = JSON.parse(workplace.get('logs'))
    // init the logs if it doesn't exist
    logs[today] ??= {};
    logs[today][tag] ??= {};
    logs[today][tag][name] ??= [];
    logs[today][tag][name].push(time);
    workplace.set('logs', JSON.stringify(logs))
    $app.saveNoValidate(workplace)
    return e.json(200)
}, $apis.requireAuth())

// when a user subscribes to a workplace (not added by the employer)
routerAdd("POST", "/subscribe/{id}", (e) => {
    const workplace = $app.findRecordById('workplace', e.request.pathValue("id"))
    if (workplace.get('employees').includes(e.auth.get('id')))
        return e.json(400, { "message": "already subscribed" })

    // add the user to the workplace
    workplace.set('employees+', e.auth.get('id'))
    // the workplace onValidate will check for payway token
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
    const { employees } = e.requestInfo().body
    // Im too fking lazy to update in batch
    employees.forEach(({id, nickname}) => 
        $app.db().newQuery(`UPDATE users SET nickname = {:nickname} WHERE id = {:id}`).bind({ nickname, id }).execute())
    
    return e.json(200)
}, $apis.requireAuth())
