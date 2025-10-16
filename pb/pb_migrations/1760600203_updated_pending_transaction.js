/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = app.findCollectionByNameOrId("pbc_1764142239")

  // add field
  collection.fields.addAt(3, new Field({
    "hidden": false,
    "id": "autodate3844849096",
    "name": "createdOn",
    "onCreate": true,
    "onUpdate": false,
    "presentable": false,
    "system": false,
    "type": "autodate"
  }))

  return app.save(collection)
}, (app) => {
  const collection = app.findCollectionByNameOrId("pbc_1764142239")

  // remove field
  collection.fields.removeById("autodate3844849096")

  return app.save(collection)
})
