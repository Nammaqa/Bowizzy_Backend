exports.up = async function (knex) {
  await knex.schema.alterTable('mock_interviews', function (table) {
    table.string('job_role').nullable();
  });
};

exports.down = async function (knex) {
  await knex.schema.alterTable('mock_interviews', function (table) {
    table.dropColumn('job_role');
  });
};
