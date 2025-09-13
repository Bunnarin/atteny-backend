/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = app.findCollectionByNameOrId("pbc_3033560182")

  // update field
  collection.fields.addAt(3, new Field({
    "hidden": false,
    "id": "number447892753",
    "max": 10000,
    "min": 1,
    "name": "proximity",
    "onlyInt": true,
    "presentable": false,
    "required": true,
    "system": false,
    "type": "number"
  }))

  return app.save(collection)
}, (app) => {
  const collection = app.findCollectionByNameOrId("pbc_3033560182")

  // update field
  collection.fields.addAt(3, new Field({
    "hidden": false,
    "id": "number447892753",
    "max": 1000,
    "min": 1,
    "name": "proximity",
    "onlyInt": true,
    "presentable": false,
    "required": true,
    "system": false,
    "type": "number"
  }))

  return app.save(collection)
})
