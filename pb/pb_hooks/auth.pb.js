onRecordAuthWithOAuth2Request((e) => {
    //collect the refreshtoken if the frontend prompts for it
    if (e.oAuth2User.refreshToken) 
        e.record.set('refresh_token', e.oAuth2User.refreshToken)
    e.next();
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
    
    e.next()
}, "users")

// when log out, we update the last logout time
routerAdd("POST", "/logout", (e) => {
    e.auth.set('last_logout', new Date());
    $app.saveNoValidate(e.auth);
    e.json(200);
})

