// deals with ip_address and refresh_token
onRecordAuthWithOAuth2Request((e) => {
    if (e.isNewRecord)
        e.createData = { ip_address: e.realIP() }
    else {
        //collect the refreshtoken if the frontend prompts for it
        if (e.oAuth2User.refreshToken)
            e.record.set('refresh_token', e.oAuth2User.refreshToken)
        e.record.set('ip_address', e.realIP())
        $app.saveNoValidate(e.record)
    }
    e.next()
})

// default values
onRecordCreate((e) => {
    const config = require(`${__hooks}/config.js`)
    e.record.set('id', e.record.get('email'))
    e.record.set('emailVisibility', true)
    e.record.set('max_employees', config.INITIAL_FREE_SPOTS())
    // need this if we create the user programmatically
    e.record.set('password', 'password')
    // A/B test: set random test_group
    e.record.set('test_group', Math.round(Math.random()))
    // free trial
    e.record.set('live_mode', true)
    // this is to prevent any fker from spawning with payway_token
    e.record.set('payway_token', '')
    e.next()
}, "users")

// we check here because verified won't be populated until after creation
onRecordAfterCreateSuccess((e) => {
    if (!e.record.get('verified'))
        e.record.set('ip_address', Date.now().toString())
    $app.saveNoValidate(e.record)
    e.next()
}, "users")

// cleanup unverified user so that we don't have any non-belonging user
// we don't need to check if they belong in any workplace (since it's stored in a json array anw)
// if we did delete any user that is in the json_array, the next time the employer save the workplace, it will be recreated anw
cronAdd("cleanup_unverified_users", "@monthly", () => {
    $app.db().newQuery(`DELETE FROM users WHERE verified = false`).execute()
})

