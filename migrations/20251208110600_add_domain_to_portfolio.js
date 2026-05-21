exports.up = async function (knex) {
  await knex.schema.table("portfolio", function (table) {
    table.string("domain").defaultTo(null);
  });
};

exports.down = async function (knex) {
  await knex.schema.table("portfolio", function (table) {
    table.dropColumn("domain");
  });
};
