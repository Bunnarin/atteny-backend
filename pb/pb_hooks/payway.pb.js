// license from here
routerAdd("POST", "/buy/{quantity}", (e) => {
    const config = require(`${__hooks}/config.js`)
    const timestamp = Math.floor(Date.now() / 1000)
    const formData = {
        amount: e.request.pathValue("quantity") * config.get_license_price(e.auth.get('test_group')),
        req_time: timestamp,
        email: e.auth.get('email'),
        merchant_id: config.PAYWAY_MERCHANT_ID(),
        tran_id: timestamp,
        return_url: `${$app.settings().meta.appURL}/payway-webhook/${e.auth.get('id')}`,
        continue_success_url: config.FRONTEND_ENDPOINT() + "/buy",
        cancel_url: config.FRONTEND_ENDPOINT(),
        currency: "USD",
    }
    let hashStr = ''
    for (const key of ['req_time', 'merchant_id', 'tran_id', 'amount', 'items', 'shipping', 'firstname', 'lastname', 'email', 'phone', 'type', 'payment_option', 'return_url', 'cancel_url', 'continue_success_url', 'return_deeplink', 'currency', 'custom_fields', 'return_params', 'payout', 'lifetime', 'additional_params', 'google_pay_token', 'skip_success_page'])
        if (formData[key])
            hashStr += formData[key]
    const hashedStr = $security.hs512(hashStr, config.PAYWAY_KEY())
    formData.hash = Buffer.from(hashedStr, 'hex').toString('base64')
    return e.json(200, formData)
}, $apis.requireAuth())

routerAdd("POST", "/payway-webhook/{user_id}", (e) => {
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

// subscription from here
routerAdd("POST", "/link-card", (e) => {
    const config = require(`${__hooks}/config.js`)
    const timestamp = new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14)
    const formData = {
        request_id: timestamp,
        request_time: timestamp,
        merchant_id: config.PAYWAY_MERCHANT_ID(),
        ctid: e.auth.get('email'),
        token_flag: 'CITO_FLEX',
        currency: 'USD',
        callback_url: $app.settings().meta.appURL + '/link-card-webhook/' + e.auth.get('id'),
    }
    const hashStr = formData.merchant_id + formData.request_time + formData.ctid + formData.callback_url + formData.request_id + formData.token_flag + formData.currency
    const hashedStr = $security.hs512(hashStr, config.PAYWAY_KEY())
    formData.hash = Buffer.from(hashedStr, 'hex').toString('base64')
    return e.json(200, formData)
}, $apis.requireAuth())

routerAdd("POST", "/link-card-webhook/{user_id}", (e) => {
    // once they have added their card, we collect the owed amount
    const { payment_credential } = e.requestInfo().body
    const config = require(`${__hooks}/config.js`)
    const user = $app.findRecordById("users", e.request.pathValue("user_id"))
    const timestamp = new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14)
    const formData = {
        request_time: timestamp,
        tran_id: timestamp,
        pwt: user.get('payway_token'),
        merchant_id: config.PAYWAY_MERCHANT_ID(),
        ctid: e.auth.get('email'),
        token_flag: 'MITR_FIX',
        currency: 'USD',
        amount: user.get('owed'),
    }
    let hashStr = ''
    for (const key of ['request_time', 'merchant_id', 'tran_id', 'amount', 'currency', 'items', 'ctid', 'pwt', 'first_name', 'last_name', 'email', 'phone', 'purchase_type', 'callback_url', 'custom_fields', 'return_params', 'payout', 'token_flag', 'shipping_fee'])
        if (formData[key])
            hashStr += formData[key]
    const hashedStr = $security.hs512(hashStr, config.PAYWAY_KEY())
    formData.hash = Buffer.from(hashedStr, 'hex').toString('base64')
    const { json } = $http.send({
        method: "POST",
        url: config.PAYWAY_ENDPOINT() + "/api/payment-gateway/v3/purchase/payment-credential",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify(formData),
    })
    if (json.status.code != '00')
        return e.json(400, { code: json.status.code, message: json.status.message })

    // update
    user.set('payway_token', payment_credential.pwt)
    user.set('owed', 0)
    $app.saveNoValidate(user)
    return e.json(200)
})

cronAdd("collect_payment", "@monthly", () => {
    const config = require(`${__hooks}/config.js`)
    const users = arrayOf(new DynamicModel({
        "id": "",
        "email": "",
        "test_group": 0,
        "payway_token": "",
        "quantity": 0,
        "live_mode": false,
    }))
    $app.db().newQuery(`
        SELECT u.id, u.email, u.test_group, u.payway_token, (te.value - u.max_employees) as quantity, u.live_mode
        FROM users u
        JOIN total_employees te ON u.id = te.id
        WHERE u.max_employees < te.value
    `).all(users);

    // make the payment for both the employees and live mode
    users.forEach(user => {
        let amount = user.quantity * config.get_rent_price(user.test_group);
        if (user.live_mode)
            amount += config.get_live_mode_price(user.test_group);
        const timestamp = new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14)
        const formData = {
            request_time: timestamp,
            tran_id: timestamp,
            pwt: user.payway_token,
            merchant_id: config.PAYWAY_MERCHANT_ID(),
            ctid: user.email,
            token_flag: 'MITR_FIX',
            currency: 'USD',
            amount,
        }
        let hashStr = ''
        for (const key of ['request_time', 'merchant_id', 'tran_id', 'amount', 'currency', 'items', 'ctid', 'pwt', 'first_name', 'last_name', 'email', 'phone', 'purchase_type', 'callback_url', 'custom_fields', 'return_params', 'payout', 'token_flag', 'shipping_fee'])
            if (formData[key])
                hashStr += formData[key]
        const hashedStr = $security.hs512(hashStr, config.PAYWAY_KEY())
        formData.hash = Buffer.from(hashedStr, 'hex').toString('base64')
        const { json } = $http.send({
            method: "POST",
            url: config.PAYWAY_ENDPOINT() + "/api/payment-gateway/v3/purchase/payment-credential",
            headers: {"Content-Type": "application/json"},
            body: JSON.stringify(formData),
        })
        if (json.status.code == '00')
            return
        
        // remove their payway_token
        const user_record = $app.findRecordById("users", user.id)
        user_record.set('payway_token', null)
        user_record.set('owed', user_record.get("owed") + amount)
        $app.saveNoValidate(user_record)

        // if failed, remove the quantity number of random employees from a random workplace
        const workplaces = $app.findRecordsByFilter("workplace", `employer='${user.id}'`)
        let numLeft = user.quantity
        workplaces.forEach(workplace => {
            const employees = workplace.get("employees")
            const numToRemove = Math.min(employees.length, numLeft)
            workplace.set('employees', employees.splice(0, numToRemove))
            $app.saveNoValidate(workplace)
            numLeft -= numToRemove
        })
        // notify them
        const message = new MailerMessage({
            from: {
                address: $app.settings().meta.senderAddress,
                name:    $app.settings().meta.senderName,
            },
            to:      [{address: user.email}],
            subject: "Payment Failed",
            html:    `You owe us ${amount} USD. So, we have decided to randomly remove ${user.quantity} employees from a random workplace.`,
        })
        $app.newMailClient().send(message)
    })
})