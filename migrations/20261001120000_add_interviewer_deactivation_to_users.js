exports.up = async function (knex) {
  if (!(await knex.schema.hasColumn("users", "interviewer_deactivated_at"))) {
    await knex.schema.alterTable("users", function (table) {
      table.timestamp("interviewer_deactivated_at", { useTz: true }).nullable();
    });
  }

  if (!(await knex.schema.hasColumn("users", "interviewer_deactivated_by"))) {
    await knex.schema.alterTable("users", function (table) {
      table.text("interviewer_deactivated_by").nullable();
    });
  }
};

exports.down = async function (knex) {
  if (await knex.schema.hasColumn("users", "interviewer_deactivated_by")) {
    await knex.schema.alterTable("users", function (table) {
      table.dropColumn("interviewer_deactivated_by");
    });
  }

  if (await knex.schema.hasColumn("users", "interviewer_deactivated_at")) {
    await knex.schema.alterTable("users", function (table) {
      table.dropColumn("interviewer_deactivated_at");
    });
  }
};