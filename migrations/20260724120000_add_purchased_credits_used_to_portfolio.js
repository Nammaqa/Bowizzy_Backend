exports.up = async function (knex) {
  await knex.schema.table("portfolio", function (table) {
    table.integer("purchased_credits_used").defaultTo(0);
  });
};

exports.down = async function (knex) {
  await knex.schema.table("portfolio", function (table) {
    table.dropColumn("purchased_credits_used");
  });
};
