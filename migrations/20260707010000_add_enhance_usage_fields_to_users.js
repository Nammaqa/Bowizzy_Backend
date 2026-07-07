exports.up = function (knex) {
  return knex.schema.alterTable("users", function (table) {
    table.integer("times_enhance_used").defaultTo(0).notNullable();
    table.boolean("isBonus_enhance_used").defaultTo(false).notNullable();
    table.integer("enhance_usage_left").defaultTo(0).notNullable();
  });
};

exports.down = function (knex) {
  return knex.schema.alterTable("users", function (table) {
    table.dropColumn("times_enhance_used");
    table.dropColumn("isBonus_enhance_used");
    table.dropColumn("enhance_usage_left");
  });
};
