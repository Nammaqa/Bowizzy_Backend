exports.up = function (knex) {
  return knex.schema.alterTable("users", function (table) {
    table.dropColumn("is_enhance_used");
    table.dropColumn("times_enhance_used");
  });
};

exports.down = function (knex) {
  return knex.schema.alterTable("users", function (table) {
    table.boolean("is_enhance_used").defaultTo(false).notNullable();
    table.integer("times_enhance_used").defaultTo(0).notNullable();
  });
};
