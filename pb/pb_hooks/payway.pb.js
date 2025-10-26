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

routerAdd("POST", "/payway/webhook/buy", e => {
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
    const hashStr = payload.req_time + payload.merchant_id + payload.tran_id;
    const hashedStr = $security.hs512(hashStr, config.PAYWAY_KEY());
    payload.hash = Buffer.from(hashedStr, 'hex').toString('base64');
    const { json } = $http.send({
        method: "POST",
        url: config.PAYWAY_ENDPOINT() + "/api/payment-gateway/v1/payments/check-transaction-2",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify(payload),
    })
    if (json.data.payment_status != 'APPROVED' && json.data.payment_status != 'PENDING') {
        $app.delete(transaction);
        return e.json(400, { "error": "invalid transaction" });
    }
    else if (json.data.payment_status != 'APPROVED')
        return e.json(400, { "error": "invalid transaction" });

    // fullfillment
    const quantity = json.data.total_amount / config.BUY_PRICE();
    e.auth.set('max_employees', e.auth.get('max_employees') + quantity);
    $app.saveNoValidate(e.auth);
    // delete the transaction
    $app.delete(transaction);
    return e.json(200);
}, $apis.requireAuth())

// payway will call this after link card or aba (this is also the pushback)
routerAdd("POST", "/payway/webhook/link", e => {
    const config = require(`${__hooks}/config.js`);
    const { request_id, payment_credential: data } = e.requestInfo().body;
    if (data.status == 1) { // token is active / unfrozen
        $app.db().newQuery(`DELETE FROM pending_transaction WHERE id = {:id}`).bind({id: request_id}).execute();
        // first we attempt to collect our debt first
        const formData = {
            request_time: Math.floor(Date.now() / 1000),
            tran_id: Date.now(),
            pwt: data.pwt,
            merchant_id: config.PAYWAY_MERCHANT_ID(),
            ctid: data.ctid,
            token_flag: 'MITR_FIX',
            currency: 'USD',
            amount: $app.findRecordById('users', data.ctid).get('debt'),
        }
        const hashKey = ['request_time', 'merchant_id', 'tran_id', 'amount', 'currency', 'ctid', 'pwt', 'token_flag'];
        const hashStr = hashKey.map(key => formData[key]).join('');
        const hashedStr = $security.hs512(hashStr, config.PAYWAY_KEY());
        formData.hash = Buffer.from(hashedStr, 'hex').toString('base64');
        const { json } = $http.send({
            method: "POST",
            url: config.PAYWAY_ENDPOINT() + "/api/payment-gateway/v3/purchase/payment-credential",
            headers: {"Content-Type": "application/json"},
            body: JSON.stringify(formData),
        })
        if (json.status.code != '00') // no adding the payment method
            return e.json(400, { "error": "invalid transaction" });
        
        $app.db().newQuery(`
            INSERT INTO payment_method (id, user, type, source_of_fund, expiration_date)
            VALUES ({:id}, {:user}, {:type}, {:source_of_fund}, {:expiration_date})
            ON CONFLICT(id) DO UPDATE SET frozen = FALSE
        `).bind({
            id: data.pwt,
            user: data.ctid,
            type: data.type.toLowerCase(),
            expiration_date: data.expired_at.replace("T", " ") + "Z",
            source_of_fund: data.source_of_fund.slice(-4), //payway only return last 4
        }).execute();
    }
    else // aba token is removed / frozen
        $app.db().newQuery(`DELETE FROM payment_method WHERE id = {:id}`).bind({id: data.pwt}).execute();
    return e.json(200);
})

// if default is true, update all other records to false
onRecordAfterUpdateSuccess((e) => {
    if (e.record.get('default')) 
        $app.db().newQuery(`
            UPDATE payment_method SET "default" = FALSE 
            WHERE user = '${e.record.get('user')}' AND id != '${e.record.get('id')}'
        `).execute();
    e.next();
}, 'payment_method')

// when user delete from the frontend
onRecordAfterDeleteSuccess((e) => {
    const config = require(`${__hooks}/config.js`);
    const formData = {
        request_time: Math.floor(Date.now() / 1000),
        merchant_id: config.PAYWAY_MERCHANT_ID(),
        ctid: e.record.get('user'),
        pwt: e.record.get('id'),
    }
    const hashStr = formData.merchant_id + formData.ctid + formData.request_time + formData.pwt;
    const hashedStr = $security.hs512(hashStr, config.PAYWAY_KEY());
    formData.hash = Buffer.from(hashedStr, 'hex').toString('base64');
    $http.send({
        method: "POST",
        url: config.PAYWAY_ENDPOINT() + "/api/payment-credential/v3/token-management/remove-token",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify(formData),
        redirect: 'follow',
    });
    e.next();
}, 'payment_method')