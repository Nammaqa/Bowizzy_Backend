exports.up = async function (knex) {
  await knex.schema.createTable("otp_verifications", function (table) {
    table.increments("id").primary();
    table.string("email").notNullable();
    table.string("otp").notNullable();
    table.timestamps(true, true);
  });
};

exports.down = async function (knex) {
  await knex.schema.dropTableIfExists("otp_verifications");
};
