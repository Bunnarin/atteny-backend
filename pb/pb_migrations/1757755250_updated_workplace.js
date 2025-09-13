/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = app.findCollectionByNameOrId("pbc_3033560182")

  // update collection data
  unmarshal({
    "listRule": ""
  }, collection)

  return app.save(collection)
}, (app) => {
  const collection = app.findCollectionByNameOrId("pbc_3033560182")

  // update collection data
  unmarshal({
    "listRule": "@request.auth.id = employer.id || employees.id ?= @request.auth.id"
  }, collection)

  return app.save(collection)
})
