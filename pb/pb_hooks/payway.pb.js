routerAdd("POST", "/buy/{quantity}", (e) => {
    const config = require(`${__hooks}/config.js`)

    const formData = {
        amount: e.request.pathValue("quantity") * config.UNIT_PRICE(),
        req_time: Math.floor(Date.now() / 1000),
        email: e.auth.get('email'),
        // return_url: e.app.settings().meta.appURL + '/payway/webhook',
        return_url: 'https://pb.popok.uk/payway/webhook',
        // might need to base64 encode this
        return_params: JSON.stringify(["email"]),
        merchant_id: config.PAYWAY_MERCHANT_ID(),
        tran_id: Math.floor(Date.now() / 1000),
        continue_success_url: "atteny.popok.uk/buy/success",
        cancel_url: "atteny.popok.uk",
        currency: "USD",
    }
    const hashKeys = ['req_time', 'merchant_id', 'tran_id', 'amount', 'items', 'shipping', 'firstname', 'lastname', 'email', 'phone', 'type', 'payment_option', 'return_url', 'cancel_url', 'continue_success_url', 'return_deeplink', 'currency', 'custom_fields', 'return_params', 'payout', 'lifetime', 'additional_params', 'google_pay_token', 'skip_success_page']
    let hashStr = ''
    for (const key of hashKeys) 
        if (formData[key])
            hashStr += formData[key]
    formData.hash = $security.hs512(hashStr, config.PAYWAY_KEY())
    return e.json(200, formData)
}, $apis.requireAuth())

routerAdd("POST", "/payway/webhook", (e) => {
    const config = require(`${__hooks}/config.js`)
    console.log(JSON.stringify(e.request.body))
    const { amount, email } = e.request.body
    const quantity = amount / config.UNIT_PRICE()
    const user = $app.findFirstRecordByData("users", "email", email)
    user.set('max_employees', user.get('max_employees') + quantity)
    $app.save(user)
    return e.json(204)
})