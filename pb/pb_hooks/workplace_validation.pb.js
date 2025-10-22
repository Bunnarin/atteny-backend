onRecordValidate((e) => {
    const config = require(`${__hooks}/config.js`)
    $app.expandRecord(e.record, ["employer"], null)
    const employer = e.record.expandedOne('employer')

    // paywall if the user doesnt have linked card
    const employees_changed = e.record.get('employees') != e.record.original().get('employees')
    if (employees_changed) {
        // if no payment_methods, we check
        const payment_method = $app.findFirstRecordByData("payment_method", 'user', employer.get('id'));
        if (!payment_method) {
            const total_employees = $app.findRecordById("total_employees", employer.get('id')).get('value')
            const free_spots = employer.get('max_employees') - total_employees
            const diff = e.record.get('employees').length - e.record.original().get('employees').length
            if (diff > free_spots)
                e.json(400) // this doesnt actually throws the error back to the /subscribe but it doesn throws an internal error
        }

        // now we get_or_create employees
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        const emails = e.record.get('employees')
        // prevent sql injection
        emails.forEach(email => {
            if (!emailRegex.test(email)) 
                throw new ApiError(400, "Invalid email format: " + email)
        })
        const emailStr = emails.join('", "');
        const existingUsers = arrayOf(new DynamicModel({"email": ""}));
        $app.db().newQuery(`SELECT email FROM users WHERE email IN ("${emailStr}")`)
            .all(existingUsers);
        const userCollection = $app.findCollectionByNameOrId("users");
        emails.forEach(email => {
            if (existingUsers.find(user => user.email === email)) 
                return;
            // create on their behalf (we use the ORM cuz we want it to run onRecordCreate hooks)
            const newUser = new Record(userCollection);
            newUser.set("email", email);
            $app.save(newUser);
        })
    }

    // if no file_id, create one
    if (!e.record.get('file_id')) {
        const res = $http.send({
            method: "POST",
            url: config.SHEET_SERVER_ENDPOINT() + "/create",
            headers: {"Content-Type": "application/json"},
            body: JSON.stringify({
                workplace_name: e.record.get('name'), 
                refresh_token: employer.get('refresh_token'), 
            }),
        })
        if (res.statusCode != 200)
            throw new ApiError(res.statusCode, res.raw)
        
        e.record.set('file_id', res.json.spreadsheetId)
    }
    e.next()
}, "workplace")