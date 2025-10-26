// cleanup unverified user so that we don't have any non-belonging user (in case user mispelled email)
// we don't need to check if they belong in any workplace (since it's stored in a json array anw)
// if we did delete any user that is in a workplace, the next time the employer save the workplace, it will be recreated anw
cronAdd("cleanup_unverified_users", "@daily", () => {
    $app.db().newQuery(`DELETE FROM users WHERE verified = false`).execute()
})

// max = 77/30s before timeout for another 30s => 60/mn
cronAdd("log_attendence", "* * * * *", () => {
    const config = require(`${__hooks}/config.js`);
    const workplaces = arrayOf(new DynamicModel({
        "id": "",
        "file_id": "",
        "name": "",
        "logs": "",
        "refresh_token": "",
    }));
    $app.db().newQuery(`
        SELECT w.id, w.file_id, w.name, w.logs, u.refresh_token
        FROM workplace w
        LEFT JOIN users u ON w.employer = u.id
        WHERE w.logs != '' AND w.file_id != ''
        ORDER BY LENGTH(w.logs) DESC
        LIMIT 60
    `).all(workplaces);

    // do this to prevent another clockin to comes here and get overwritten while it's being executed (1mn)
    if (workplaces.length)
        $app.db().newQuery(`
            UPDATE workplace SET logs = '' WHERE id IN ("${workplaces.map(w => w.id).join('", "')}")
        `).execute();

    // helper
    const transformLogsToArray = (logs) => 
        Object.entries(logs).flatMap(([date, tags]) => 
            Object.entries(tags).flatMap(([tag, names]) => 
                Object.entries(names).flatMap(([name, times]) => 
                    times.map(time => [date, time, name, tag])
                )
            )
        );
        
    for (const [index, workplace] of workplaces.entries()) {
        const res = $http.send({
            method: "POST",
            url: config.SHEET_SERVER_ENDPOINT() + "/append",
            headers: {"Content-Type": "application/json"},
            body: JSON.stringify({
                file_id: workplace.file_id,
                workplace_name: workplace.name,
                refresh_token: workplace.refresh_token,
                rows: transformLogsToArray(JSON.parse(workplace.logs)),
            }),
        })
        if (res.statusCode != 200) { //restore the nulled logs
            const workplacesToRestore = workplaces.slice(index);
            const sqlCases = workplacesToRestore.map(w => `WHEN id = '${w.id}' THEN '${w.logs}'`).join(' ');
            $app.db().newQuery(`UPDATE workplace SET logs = CASE ${sqlCases} END`).execute();
            break;
        }
        if (res.json) 
            $app.db().newQuery(`
                UPDATE workplace SET file_id = '${res.json.newFileId}' WHERE id = '${workplace.id}'
            `).execute();
    }
})

// 100/hour => 72000 max subscription customer
cronAdd("collect_rent", "@hourly", () => { 
    return;
    const config = require(`${__hooks}/config.js`);
    const thisMonth = new Date().getMonth() + 1;
    const users = arrayOf(new DynamicModel({
        "id": "",
        "test_group": 0,
        "quantity": 0,
        "payway_tokens": [],
    }));
    $app.db().newQuery(`
        SELECT u.id, u.test_group, (te.value - u.max_employees) as quantity, json_group_array(pm.id) as payway_tokens
        FROM users u
        JOIN total_employees te ON u.id = te.id
        LEFT JOIN payment_method pm ON u.id = pm.user
        WHERE u.last_paid != ${thisMonth} AND te.value > u.max_employees
        GROUP BY u.id, u.test_group, te.value, u.max_employees
        ORDER BY pm."default" DESC
        LIMIT 100
    `).all(users);

    users.forEach(user => {
        const amount = user.quantity * config.get_rent_price(user.test_group);
        for (const pwt of user.payway_tokens) {
            const formData = {
                request_time: Math.floor(Date.now() / 1000),
                tran_id: Date.now(),
                pwt,
                merchant_id: config.PAYWAY_MERCHANT_ID(),
                ctid: user.id,
                token_flag: 'MITR_FIX',
                currency: 'USD',
                amount,
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
            if (json.status.code == '00') // set that they already paid this month
                return $app.db().newQuery(`UPDATE users SET last_paid = ${thisMonth} WHERE id = '${user.id}'`).execute();
            else
                $app.db().newQuery(`DELETE FROM payment_method WHERE id = '${pwt}'`).execute();
            // if payment failed it'll try other token until run out => out of the loop penalty
        }
        
        // add debt if all failed
        $app.db().newQuery(`UPDATE users SET debt = debt + ${amount} WHERE id = '${user.id}'`).execute();

        // remove the quantity number of random employees from random workplaces
        const workplaces = $app.findRecordsByFilter("workplace", `employer='${user.id}'`);
        let numLeft = user.quantity;
        while (numLeft > 0) {
            // get the workplace with the highest number of employees
            const [ workplace ] = workplaces.sort((a, b) => b.get("employees").length - a.get("employees").length);
            const employees = workplace.get("employees");
            const numToRemove = Math.min(employees.length, numLeft);
            workplace.set('employees', employees.slice(numToRemove));
            $app.saveNoValidate(workplace);
            numLeft -= numToRemove;
        }

        // notify them
        $app.newMailClient().send(new MailerMessage({
            to: [{address: user.id}],
            subject: "Payment Failed",
            html: `You owe us ${amount} USD. 
            So, we have decided to randomly remove ${user.quantity} employees from a random workplace.
            Please set new payment methods to add more employees`,
        }))
    })
})

// 7 day old
cronAdd("cleanup_old_transaction", "@weekly", () => {
    $app.db().newQuery(`
        DELETE FROM pending_transaction WHERE id < (strftime('%s', 'now') - 604800) * 1000
    `).execute();
})

// to pretend that we comply with payway's api quota or sth
// cronAdd("temp_payway", "* * * * *", () => {
//     const config = require(`${__hooks}/config.js`)
//     const transactions = $app.findRecordsByFilter("pending_transaction", "locked = false");
//     transactions.forEach(transaction => {
//         transaction.set('locked', true);
//         $app.saveNoValidate(transaction);
//         // read createdOn to ensure we only chekc 1mn after creation, if not 1mn yet, sleep until 1mn
//         const timeDiff = Date.now() - Number(transaction.get('id'));
//         if (timeDiff < 60 * 1000) 
//             sleep(60 * 1000 - timeDiff);
        
//         // then check if the transaction is approved in payway database
//         const payload = {
//             merchant_id: config.PAYWAY_MERCHANT_ID(),
//             tran_id: transaction.get('id'),
//         }
//         const startTime = Date.now();
//         let json;
//         do {
//             payload.req_time = Math.floor(Date.now() / 1000);
//             const hashStr = payload.req_time + payload.merchant_id + payload.tran_id
//             const hashedStr = $security.hs512(hashStr, config.PAYWAY_KEY())
//             payload.hash = Buffer.from(hashedStr, 'hex').toString('base64')
//             const res = $http.send({
//                 method: "POST",
//                 url: config.PAYWAY_ENDPOINT() + "/api/payment-gateway/v1/payments/check-transaction-2",
//                 headers: {"Content-Type": "application/json"},
//                 body: JSON.stringify(payload),
//             })
//             if (res.json.data.payment_status == 'APPROVED') {
//                 json = res.json;
//                 break;
//             }
//             sleep(30000);
//         } while (Date.now() - startTime < 15 * 60 * 1000)

//         if (!json)
//             return;
//         // fullfillment
//         const user = $app.findRecordById("users", transaction.get('user'));
//         const quantity = json.data.total_amount / config.BUY_PRICE();
//         user.set('max_employees', user.get('max_employees') + quantity)
//         $app.saveNoValidate(user);
//         // delete the transaction
//         $app.delete(transaction);
//     })
// })