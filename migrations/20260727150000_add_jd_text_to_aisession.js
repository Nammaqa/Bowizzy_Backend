exports.up = async function (knex) {
  await knex.schema.alterTable("aisession", function (table) {
    table.text("jd_text").nullable();
  });
};

exports.down = async function (knex) {
  await knex.schema.alterTable("aisession", function (table) {
    table.dropColumn("jd_text");
  });
};
