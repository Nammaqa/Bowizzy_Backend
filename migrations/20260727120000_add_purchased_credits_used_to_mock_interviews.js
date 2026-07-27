exports.up = async function (knex) {
  await knex.schema.table("mock_interviews", function (table) {
    table.integer("purchased_credits_used").unsigned().defaultTo(0);
  });
};

exports.down = async function (knex) {
  await knex.schema.table("mock_interviews", function (table) {
    table.dropColumn("purchased_credits_used");
  });
};
