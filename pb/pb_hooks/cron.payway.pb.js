// fking cronjob
cronAdd("temp_payway", "* * * * *", () => {
    const config = require(`${__hooks}/config.js`)
    const transactions = $app.findRecordsByFilter("pending_transaction", "locked = false");
    transactions.forEach(transaction => {
        transaction.set('locked', true);
        $app.saveNoValidate(transaction);
        // read createdOn to ensure we only chekc 1mn after creation, if not 1mn yet, sleep until 1mn
        const timeDiff = Date.now() - Number(transaction.get('id')) * 1000;
        if (timeDiff < 60 * 1000) 
            sleep(60 * 1000 - timeDiff);
        
        // then check if the transaction is approved in payway database
        const payload = {
            merchant_id: config.PAYWAY_MERCHANT_ID(),
            tran_id: transaction.get('id'),
        }
        const startTime = Date.now();
        let json;
        do {
            payload.req_time = Math.floor(Date.now() / 1000);
            const hashStr = payload.req_time + payload.merchant_id + payload.tran_id
            const hashedStr = $security.hs512(hashStr, config.PAYWAY_KEY())
            payload.hash = Buffer.from(hashedStr, 'hex').toString('base64')
            const res = $http.send({
                method: "POST",
                url: config.PAYWAY_ENDPOINT() + "/api/payment-gateway/v1/payments/check-transaction-2",
                headers: {"Content-Type": "application/json"},
                body: JSON.stringify(payload),
            })
            console.log(JSON.stringify(res));
            if (res.json.data.payment_status == 'APPROVED') {
                json = res.json;
                break;
            }
            sleep(30000);
        } while (Date.now() - startTime < 15 * 60 * 1000)

        if (!json)
            return;
        // fullfillment
        const user = $app.findRecordById("users", transaction.get('user'));
        const quantity = json.data.total_amount / config.get_license_price(user.get('test_group'))
        user.set('max_employees', user.get('max_employees') + quantity)
        $app.saveNoValidate(user);
        // delete the transaction
        $app.delete(transaction);
    })
})