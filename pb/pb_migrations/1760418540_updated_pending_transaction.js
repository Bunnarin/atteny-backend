/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = app.findCollectionByNameOrId("pbc_1764142239")

  // update collection data
  unmarshal({
    "indexes": [
      "CREATE UNIQUE INDEX `idx_l2DjCJWPT2` ON `pending_transaction` (`user`)"
    ]
  }, collection)

  return app.save(collection)
}, (app) => {
  const collection = app.findCollectionByNameOrId("pbc_1764142239")

  // update collection data
  unmarshal({
    "indexes": []
  }, collection)

  return app.save(collection)
})
