exports.up = async function (knex) {
  await knex.schema.table("portfolio", function (table) {
    table.string("razorpay_order_id");
  });
};

exports.down = async function (knex) {
  await knex.schema.table("portfolio", function (table) {
    table.dropColumn("razorpay_order_id");
  });
};
