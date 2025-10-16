// fking cronjob
cronAdd("temp_payway", "* * * * *", () => {
    const config = require(`${__hooks}/config.js`)
    const transactions = $app.findRecordsByFilter("pending_transaction", "locked = false");
    transactions.forEach(transaction => {
        transaction.set('locked', true);
        $app.saveNoValidate(transaction);
        // read createdOn to ensure we only chekc 1mn after creation, if not 1mn yet, sleep until 1mn
        const createdOn = transaction.get('createdOn');
        const timeTilAMinute = 60 * 1000 - (Date.now() - new Date(createdOn).getTime());
        console.log(timeTilAMinute);
        if (timeTilAMinute > 0) 
            sleep(timeTilAMinute);
        
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
            if (res.json.data.payment_status == 'APPROVED') {
                json = res.json;
                break;
            }
            sleep(30000);
        } while (Date.now() - startTime < 15 * 60 * 1000)

        if (!json)
            return;
        // fullfillment
        const live_mode = json.data.total_amount == config.get_live_mode_price();
        const user = $app.findRecordById("users", transaction.get('user'));
        if (live_mode) {
            user.set('paid_live_mode', true);
            user.set('live_mode', true);
        } else {
            const quantity = json.data.total_amount / config.get_employee_price(user.get('test_group'))
            user.set('max_employees', user.get('max_employees') + quantity)
        }
        $app.saveNoValidate(user);
        // delete the transaction
        $app.delete(transaction);
    })
})