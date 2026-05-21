exports.up = async function (knex) {
  await knex.schema.table("portfolio", function (table) {
    table.json("portfolio_json").defaultTo(null);
  });
};

exports.down = async function (knex) {
  await knex.schema.table("portfolio", function (table) {
    table.dropColumn("portfolio_json");
  });
};
