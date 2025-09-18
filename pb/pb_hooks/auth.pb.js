onRecordAuthWithOAuth2Request((e) => {
    if (e.isNewRecord)
        e.createData = { ip_address: e.realIP() }
    else {
        e.record.set('ip_address', e.realIP())
        $app.save(e.record)
    }
    e.next()
})

onRecordAfterCreateSuccess((e) => {
    const config = require(`${__hooks}/config.js`)
    e.record.set('emailVisibility', true)
    e.record.set('max_employees', config.INITIAL_FREE_SPOTS())
    $app.save(e.record)
    e.next()
}, "users")
