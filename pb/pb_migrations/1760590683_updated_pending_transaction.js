/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = app.findCollectionByNameOrId("pbc_1764142239")

  // add field
  collection.fields.addAt(2, new Field({
    "hidden": false,
    "id": "bool3939682449",
    "name": "locked",
    "presentable": false,
    "required": false,
    "system": false,
    "type": "bool"
  }))

  return app.save(collection)
}, (app) => {
  const collection = app.findCollectionByNameOrId("pbc_1764142239")

  // remove field
  collection.fields.removeById("bool3939682449")

  return app.save(collection)
})
