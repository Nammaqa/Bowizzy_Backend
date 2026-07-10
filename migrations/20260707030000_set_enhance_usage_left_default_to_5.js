exports.up = function (knex) {
  return knex.schema.alterTable("users", function (table) {
    table.integer("enhance_usage_left").defaultTo(5).alter();
  });
};

exports.down = function (knex) {
  return knex.schema.alterTable("users", function (table) {
    table.integer("enhance_usage_left").defaultTo(0).alter();
  });
};
