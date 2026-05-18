exports.up = async function (knex) {
  await knex.schema.createTable("portfolio", function (table) {
    table.increments("portfolio_id").primary();

    table
      .integer("user_id")
      .unsigned()
      .notNullable()
      .references("user_id")
      .inTable("users")
      .onDelete("CASCADE");

    table.string("portfolio_name").notNullable();

    table.text("description");

    table.string("portfolio_type").notNullable();

    table
      .integer("template_id")
      .unsigned()
      .references("resume_template_id")
      .inTable("resume_templates")
      .onDelete("SET NULL");

    table.decimal("paid_amount", 10, 2).defaultTo(0);

    table.string("razorpay_payment_id");

    table.integer("credits_used").defaultTo(0);

    table.enu("status", ["pending", "completed", "failed"]).defaultTo("pending");

    table.timestamps(true, true);
  });
};

exports.down = async function (knex) {
  await knex.schema.dropTableIfExists("portfolio");
};
