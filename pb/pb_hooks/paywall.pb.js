onRecordValidate((e) => {
    const config = require(`${__hooks}/config.js`)
    // first paywall
    $app.expandRecord(e.record, ["employer"], null)
    const employer = e.record.expandedOne('employer')
    const total_employees = $app.findRecordById("total_employees", employer.get('id'))
    const free_spots = employer.get('max_employees') - total_employees.get('value')
    const diff = e.record.get('employees').length - e.record.original().get('employees').length
    if (diff > free_spots)
        throw new ApiError(400, "Not enough free spots")

    // second paywall
    const result = arrayOf(new DynamicModel({
        "id": "",
        "location": { "lat": 0, "lon": 0 }
    }))
    $app.db()
        .newQuery(`
            SELECT 1 AS "exists"
            FROM workplace
            WHERE id != {:recordId}
            AND (
                6371000 * acos(
                    cos(radians({:lat})) * cos(radians(json_extract(location, '$.lat'))) *
                    cos(radians(json_extract(location, '$.lon')) - radians({:lon})) +
                    sin(radians({:lat})) * sin(radians(json_extract(location, '$.lat')))
                )
            ) <= {:distance}
            LIMIT 1
        `)
        .bind({
            "recordId": e.record.id,
            "lat": e.record.get('location').lat,
            "lon": e.record.get('location').lon,
            "distance": config.UNIQUE_DISTANCE()
        })
        .all(result)
    if (result.length)  
        throw new ApiError(400, "There is another workplace within 100m. Each workplace must be 100m unique")

    e.next()
}, "workplace")