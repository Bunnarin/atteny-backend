routerAdd("POST", "/buy/{quantity}", (e) => {
    const config = require(`${__hooks}/config.js`)
    const amount = e.request.pathValue("quantity") * config.UNIT_PRICE()
    const req_time = Math.floor(Date.now() / 1000).toString()
    const email = e.auth.get('email')
    const return_url = e.app.settings().meta.appURL + '/payway/webhook'
    const hashStr = req_time + config.PAYWAY_MERCHANT_ID() + req_time + amount + email + return_url
    const hash = $security.hs512(hashStr, config.PAYWAY_KEY())
    return e.json(200, {
        hash,
        tran_id: req_time,
        amount,
        merchant_id: config.PAYWAY_MERCHANT_ID(),
        req_time,
        email,
        return_url,
    })
}, $apis.requireAuth())


routerAdd("POST", "/payway/webhook", (e) => {
    const config = require(`${__hooks}/config.js`)
    const { amount, email } = e.request.body
    const quantity = amount / config.UNIT_PRICE()
    let user = $app.findFirstRecordByData("users", "email", email)
    user.set('free_spots', user.get('free_spots') + quantity)
    $app.save(user)
    return e.json(200, { "message": "success" })
})