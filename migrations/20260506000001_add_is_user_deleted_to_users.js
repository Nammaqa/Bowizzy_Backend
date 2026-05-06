exports.up = function (knex) {
  return knex.schema.alterTable("users", function (table) {
    table.boolean("is_user_deleted").defaultTo(false);
  });
};

exports.down = function (knex) {
  return knex.schema.alterTable("users", function (table) {
    table.dropColumn("is_user_deleted");
  });
};
