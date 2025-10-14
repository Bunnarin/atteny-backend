// for AB testing
routerAdd("GET", "/payway/params", (e) => {
    const config = require(`${__hooks}/config.js`)
    return e.json(200, { 
        employee_price: config.get_employee_price(e.auth.get('test_group')),
        live_mode_price: config.get_live_mode_price(e.auth.get('test_group')),
        merchant_id: config.PAYWAY_MERCHANT_ID()
    })
}, $apis.requireAuth())

// this route hash and also create a transaction record sicne we can't rely on payway's return url
routerAdd("POST", "/payway/hash", e => {
    const config = require(`${__hooks}/config.js`)
    const { hashStr, tran_id } = e.requestInfo().body
    const hashedStr = $security.hs512(hashStr, config.PAYWAY_KEY())
    const hash = Buffer.from(hashedStr, 'hex').toString('base64')    
    e.json(200, { hash });

    // create a transaction record (idc if it exists since we prioritise new over old)
    $app.db().newQuery(` 
        DELETE FROM pending_transaction WHERE user = '${e.auth.get('id')}';
        INSERT INTO pending_transaction (id, user) VALUES ('${tran_id}', '${e.auth.get('id')}');
    `).execute();
}, $apis.requireAuth())

routerAdd("GET", "/webhook/{item}", e => {
    const config = require(`${__hooks}/config.js`)

    // first we check if the tran_id exist in our database
    const transaction = $app.findFirstRecordByData("pending_transaction", "user", e.auth.get('id'));
    if (!transaction)
        return e.json(400, { "error": "invalid transaction" })

    // then check if the transaction is approved in payway database
    const payload = {
        req_time: Math.floor(Date.now() / 1000),
        merchant_id: config.PAYWAY_MERCHANT_ID(),
        tran_id: transaction.get('id'),
    }
    const hashStr = payload.req_time + payload.merchant_id + payload.tran_id
    const hashedStr = $security.hs512(hashStr, config.PAYWAY_KEY())
    payload.hash = Buffer.from(hashedStr, 'hex').toString('base64')
    const { json } = $http.send({
        method: "POST",
        url: config.PAYWAY_ENDPOINT() + "/api/payment-gateway/v1/payments/check-transaction-2",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify(payload),
    })
    if (json.data.payment_status != 'APPROVED')
        return e.json(400, { "error": "invalid transaction" })

    // fullfillment
    const item = e.request.pathValue("item");
    if (item == "employee") {
        const quantity = json.data.total_amount / config.get_employee_price(e.auth.get('test_group'))
        e.auth.set('max_employees', e.auth.get('max_employees') + quantity)
        $app.saveNoValidate(e.auth);
    } else if (item == "live-mode") {
        const paidInFull = json.data.total_amount == config.get_live_mode_price(e.auth.get('test_group'));
        if (!paidInFull)
            return e.json(400, { "error": "invalid transaction" })
        e.auth.set('paid_live_mode', true);
        e.auth.set('live_mode', true);
        $app.saveNoValidate(e.auth);
    }
    // delete the transaction
    $app.delete(transaction);
    return e.json(200);
}, $apis.requireAuth())