exports.up = async function (knex) {
  await knex.schema.alterTable("users", function (table) {
    table.boolean("admin_review").defaultTo(false).notNullable();
  });

  await knex("users")
    .where("review_status", "under_review")
    .update({ admin_review: true });
};

exports.down = function (knex) {
  return knex.schema.alterTable("users", function (table) {
    table.dropColumn("admin_review");
  });
};