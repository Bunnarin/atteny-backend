onRecordValidate((e) => {
    $app.expandRecord(e.record, ["employer"], null)
    const employer = e.record.expandedOne('employer')
    const free_spots = employer.get('free_spots')
    console.log(free_spots)
    const diff = e.record.get('employees').length - e.record.original().get('employees').length
    if (diff > free_spots)
        e.error("Not enough free spots")
    employer.set('free_spots', free_spots - diff)
    $app.save(employer)
    e.next()
}, "workplace")