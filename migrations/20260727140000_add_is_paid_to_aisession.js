exports.up = async function (knex) {
  await knex.schema.alterTable("aisession", function (table) {
    table.boolean("is_paid").notNullable().defaultTo(false);
  });
};

exports.down = async function (knex) {
  await knex.schema.alterTable("aisession", function (table) {
    table.dropColumn("is_paid");
  });
};
