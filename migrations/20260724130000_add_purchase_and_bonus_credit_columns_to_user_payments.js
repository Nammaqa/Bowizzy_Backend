exports.up = async function (knex) {
  await knex.schema.alterTable("user_payments", function (table) {
    table.integer("purchased_credits_applied").defaultTo(0);
    table.integer("bonus_credits_applied").defaultTo(0);
  });
};

exports.down = async function (knex) {
  await knex.schema.alterTable("user_payments", function (table) {
    table.dropColumn("purchased_credits_applied");
    table.dropColumn("bonus_credits_applied");
  });
};
