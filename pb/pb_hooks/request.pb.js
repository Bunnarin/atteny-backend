// notify the employer when a new leave request is created
onRecordAfterCreateSuccess((e) => {
    e.next()
    $app.expandRecord(e.record, ["createdBy", "workplace"], null)
    const requester = e.record.expandedOne('createdBy').get('full_name')
    const workplace = e.record.expandedOne('workplace')
    $app.expandRecord(workplace, ["employer"], null)
    const employer_email = workplace.expandedOne('employer').get('email')
    const [date, _] = e.record.get('date').toString().split(' ')
    const message = new MailerMessage({
        from: {
            address: e.app.settings().meta.senderAddress,
            name:    e.app.settings().meta.senderName,
        },
        to:      [{address: employer_email}],
        subject: "New Leave Request",
        html:    `${requester} has requested leave \non ${date} \nfor the reason: ${e.record.get('reason')}`,
    })
    e.app.newMailClient().send(message)
}, "request")

routerAdd("POST", "/approve/{id}", (e) => {
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
            subject: "Leave Request Approved",
            html:    `your leave request for ${request.get('date')} has been approved`,
        })
        e.app.newMailClient().send(message)
        // write to the sheet
        const res = $http.send({
            method: "POST",
            url: "http://127.0.0.1:3000/approve",
            body: { request },
        })
        // delete the request
        $app.delete(request)
    } catch (error) {
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