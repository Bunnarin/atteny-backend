onRecordAuthWithOAuth2Request((e) => {
    if (e.isNewRecord)
        e.createData = { ip_address: e.realIP() }

    e.next()

    if (!e.isNewRecord) {
        e.record.set('ip_address', e.realIP())
        $app.save(e.record)
    }
})

onRecordAfterCreateSuccess((e) => {
    e.record.set('emailVisibility', true)
    e.record.set('free_spots', 5)
    $app.save(e.record)
    e.next()
}, "users")
