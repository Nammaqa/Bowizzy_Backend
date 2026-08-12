exports.up = function (knex) {
  return knex.schema.alterTable("users", function (table) {
    table
      .enum("review_status", ["active", "under_review"])
      .defaultTo("active")
      .notNullable();
  });
};

exports.down = function (knex) {
  return knex.schema.alterTable("users", function (table) {
    table.dropColumn("review_status");
  });
};
