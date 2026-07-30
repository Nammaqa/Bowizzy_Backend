exports.up = function (knex) {
  return knex.schema.alterTable("users", function (table) {
    table.boolean("is_interviewer_banned").defaultTo(false).notNullable();
  });
};

exports.down = function (knex) {
  return knex.schema.alterTable("users", function (table) {
    table.dropColumn("is_interviewer_banned");
  });
};
