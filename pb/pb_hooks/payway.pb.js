// for AB testing
routerAdd("GET", "/pricings", (e) => {
    const config = require(`${__hooks}/config.js`)
    return e.json(200, { 
        license_price: config.get_license_price(e.auth.get('test_group')),
        live_mode_price: config.get_live_mode_price(e.auth.get('test_group')) 
    })
}, $apis.requireAuth())

routerAdd("GET", "/payway-merchant-id", e  => {
    const config = require(`${__hooks}/config.js`)
    e.json(200, { merchant_id: config.PAYWAY_MERCHANT_ID() })
}, $apis.requireAuth())

routerAdd("POST", "/hash-payway", e => {
    const config = require(`${__hooks}/config.js`)
    const { hashStr } = e.requestInfo().body
    const hashedStr = $security.hs512(hashStr, config.PAYWAY_KEY())
    const hash = Buffer.from(hashedStr, 'hex').toString('base64')
    e.json(200, { hash })
}, $apis.requireAuth())

routerAdd("POST", "/webhook/purchase/{user_id}", (e) => {
    const config = require(`${__hooks}/config.js`)
    const { tran_id } = e.requestInfo().body

    // first we check if the tran_id exists and is at most 10mn recent
    const formData = {
        req_time: Math.floor(Date.now() / 1000),
        merchant_id: config.PAYWAY_MERCHANT_ID(),
        tran_id,
    }
    const hashStr = formData.req_time + formData.merchant_id + formData.tran_id
    const hashedStr = $security.hs512(hashStr, config.PAYWAY_KEY())
    formData.hash = Buffer.from(hashedStr, 'hex').toString('base64')

    const { json } = $http.send({
        method: "POST",
        url: config.PAYWAY_ENDPOINT() + "/api/payment-gateway/v1/payments/check-transaction-2",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify(formData),
    })

    const TEN_MINUTES = Date.now() - 10 * 60 * 1000;
    const transaction_date = Date.parse(json.data.transaction_date.replace(' ', 'T'))
    if (json.data.payment_status_code != 0 || transaction_date < TEN_MINUTES)
        return e.json(400, { "error": "webhook rejected" })
    
    // fullfillment
    const user = $app.findRecordById("users", e.request.pathValue("user_id"))
    const quantity = json.data.original_amount / config.get_license_price(user.get('test_group'))
    user.set('max_employees', user.get('max_employees') + quantity)
    $app.saveNoValidate(user)
    return e.json(200)
})

routerAdd("POST", "/webhook/live-mode/{user_id}", (e) => {
    const config = require(`${__hooks}/config.js`)
    const { tran_id } = e.requestInfo().body

    // first we check if the tran_id exists and is at most 10mn recent
    const formData = {
        req_time: Math.floor(Date.now() / 1000),
        merchant_id: config.PAYWAY_MERCHANT_ID(),
        tran_id,
    }
    const hashStr = formData.req_time + formData.merchant_id + formData.tran_id
    const hashedStr = $security.hs512(hashStr, config.PAYWAY_KEY())
    formData.hash = Buffer.from(hashedStr, 'hex').toString('base64')

    const { json } = $http.send({
        method: "POST",
        url: config.PAYWAY_ENDPOINT() + "/api/payment-gateway/v1/payments/check-transaction-2",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify(formData),
    })

    const TEN_MINUTES = Date.now() - 10 * 60 * 1000;
    const transaction_date = Date.parse(json.data.transaction_date.replace(' ', 'T'))
    if (json.data.payment_status_code != 0 || transaction_date < TEN_MINUTES)
        return e.json(400, { "error": "webhook rejected" })
    
    // fullfillment
    $app.db().newQuery(`
        UPDATE users SET paid_live_mode = true WHERE id = {:user_id}
    `).bind({ user_id: e.request.pathValue("user_id") }).execute()
    return e.json(200)
})