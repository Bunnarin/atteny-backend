// cleanup unverified user so that we don't have any non-belonging user
// we don't need to check if they belong in any workplace (since it's stored in a json array anw)
// if we did delete any user that is in the json_array, the next time the employer save the workplace, it will be recreated anw
cronAdd("cleanup_unverified_users", "@daily", () => {
    $app.db().newQuery(`DELETE FROM users WHERE verified = false`).execute()
})

// 20 write/mn (could up to 30, but I want to leave 10 write/mn to delete)
// if hit 30, then it'll timeout for 1mn
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
        WHERE w.logs != ''
        ORDER BY LENGTH(w.logs) DESC
        LIMIT 20
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
    }
})

// cron job to collect rent
cronAdd("collect_rent", "@monthly", () => {
    const config = require(`${__hooks}/config.js`)
    const users = arrayOf(new DynamicModel({
        "id": "",
        "test_group": 0,
        "quantity": 0,
        "payway_methods": [],
    }));
    $app.db().newQuery(`
        SELECT 
            u.id, 
            u.test_group, 
            (te.value - u.max_employees) as quantity,
            json_group_array(json_object('id', pm.id)) as payway_methods
        FROM users u
        JOIN total_employees te ON u.id = te.id
        LEFT JOIN payment_method pm ON u.id = pm.user
        WHERE te.value > u.max_employees
        GROUP BY u.id, u.test_group, te.value, u.max_employees
    `).all(users);

    users.forEach(user => {
        return console.log(JSON.stringify(user.payway_methods));
        let amount = user.quantity * config.get_rent_price(user.test_group);
        const formData = {
            request_time: Math.floor(Date.now() / 1000),
            tran_id: Date.now(),
            pwt: user.payway_token,
            merchant_id: config.PAYWAY_MERCHANT_ID(),
            ctid: user.id,
            email: user.id,
            token_flag: 'MITR_FIX',
            currency: 'USD',
            amount,
        }
        const hashKey = ['request_time', 'merchant_id', 'tran_id', 'amount', 'currency', 'ctid', 'pwt', 'email', 'token_flag'];
        const hashStr = hashKey.map(key => formData[key]).join('');
        const hashedStr = $security.hs512(hashStr, config.PAYWAY_KEY());
        formData.hash = Buffer.from(hashedStr, 'hex').toString('base64');
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
        user_record.set('debt', user_record.get("debt") + amount)
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