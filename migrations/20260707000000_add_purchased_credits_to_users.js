exports.up = function (knex) {
  return knex.schema.alterTable("users", function (table) {
    table.integer("purchased_credits").defaultTo(0).notNullable();
  });
};

exports.down = function (knex) {
  return knex.schema.alterTable("users", function (table) {
    table.dropColumn("purchased_credits");
  });
};
