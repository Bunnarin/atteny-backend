// notify the employer when a new leave request is created
onRecordAfterCreateSuccess((e) => {
    e.next()
    $app.expandRecord(e.record, ["createdBy", "workplace"], null)
    const requester = e.record.expandedOne('createdBy').get('name')
    const workplace = e.record.expandedOne('workplace')
    $app.expandRecord(workplace, ["employer"], null)
    const [date, _] = e.record.get('date').toString().split(' ')
    const message = new MailerMessage({
        from: {
            address: e.app.settings().meta.senderAddress,
            name:    e.app.settings().meta.senderName,
        },
        to:      [{address: workplace.expandedOne('employer').get('email')}],
        subject: "New Leave Request",
        html:    `${requester} has requested leave \non ${date} \nfor the reason: ${e.record.get('reason')}`,
    })
    e.app.newMailClient().send(message)
}, "request")

routerAdd("POST", "/approve/{id}", (e) => {
    try {
        const request = $app.findRecordById('request', e.request.pathValue("id"))

        // send email to the createdBy
        $app.expandRecord(request, ["createdBy", "workplace"], null)
        const requester_email = request.expandedOne('createdBy').get('email')
        const message = new MailerMessage({
            from: {
                address: e.app.settings().meta.senderAddress,
                name:    e.app.settings().meta.senderName,
            },
            to:      [{address: requester_email}],
            subject: "Leave Request Approved",
            html:    `your leave request for ${request.get('date')} has been approved`,
        })
        e.app.newMailClient().send(message)

        // write to the sheet
        const workplace = request.expandedOne('workplace')
        $app.expandRecord(workplace, ["employer"], null)
        const res = $http.send({
            method: "POST",
            url: "http://127.0.0.1:3000/approve",
            headers: {"Content-Type": "application/json"},
            body: JSON.stringify({
                file_id: workplace.get('file_id'),
                sheet_name: workplace.get('name') + ' leave log',
                refresh_token: workplace.expandedOne('employer').get('google_refresh_token'),
                name: request.expandedOne('createdBy').get('name'),
                date: request.get('date').toString().slice(0, 10),
                reason: request.get('reason'),
            }),
        })
        if (!res.json.success)
            return e.json(400, { "error": res.json.message })
        
        // delete the request
        $app.delete(request)
        
        return e.json(200, { "message": "success" })
    } catch (error) {
        console.log(error)
        return e.json(400, { "error": error })
    }
}, $apis.requireAuth())

routerAdd("POST", "/reject/{id}", (e) => {
    try {
        const request = $app.findRecordById('request', e.request.pathValue("id"))
        // send email to the createdBy
        $app.expandRecord(request, ["createdBy"], null)
        const requester_email = request.expandedOne('createdBy').get('email')
        const message = new MailerMessage({
            from: {
                address: e.app.settings().meta.senderAddress,
                name:    e.app.settings().meta.senderName,
            },
            to:      [{address: requester_email}],
            subject: "Leave Request Rejected",
            html:    `your leave request for ${request.get('date')} has been rejected`,
        })
        e.app.newMailClient().send(message)
        // delete the request
        $app.delete(request)
    } catch (error) {
        return e.json(400, { "error": error })
    }
}, $apis.requireAuth())