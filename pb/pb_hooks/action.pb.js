routerAdd("POST", "/clockin/{id}", (e) => {
    try {
        // validate that the user is an employee of the workplace
        const workplace = $app.findRecordById('workplace', e.request.pathValue("id"))
        $app.expandRecord(workplace, ["employer"], null)
        const employer = workplace.expandedOne('employer')
        if (!workplace.get('employees').includes(e.auth.id)) 
            return e.json(400, { "error": "You are not authorized to clock in for this workplace" })
        // write to the sheet
        const res = $http.send({
            method: "POST",
            url: "http://127.0.0.1:3000/clockin",
            headers: {"Content-Type": "application/json"},
            body: JSON.stringify({
                file_id: workplace.get('file_id'), 
                sheet_name: workplace.get('name') + ' log', 
                refresh_token: employer.get('google_refresh_token'), 
                name: e.auth.get('name') 
            }),
        })
        return e.json(200, { "message": "success" })
    } catch (error) {
        console.log(error);
        return e.json(400, { "error": error })
    }
}, $apis.requireAuth())

// when a user subscribes to a workplace (not added by the employer)
routerAdd("POST", "/subscribe/{id}", (e) => {
    try {
        const workplace = $app.findRecordById('workplace', e.request.pathValue("id"))
        $app.expandRecord(workplace, ["employer"], null)
        // ensure that the employer free_spots still has room for one more
        const employer = workplace.expandedOne('employer')
        if (employer.get('free_spots') === 0) 
            return e.json(400, { "error": "No more free spots available" })
        // add the user to the workplace
        workplace.set('employees+', e.auth.id)
        $app.save(workplace)
        // update the employer free_spots
        employer.set('free_spots', employer.get('free_spots') - 1)
        $app.save(employer)
    } catch (error) {
        console.log(error);
        return e.json(400, { "error": error })
    }
    return e.json(200, { "message": "success" })
}, $apis.requireAuth())
