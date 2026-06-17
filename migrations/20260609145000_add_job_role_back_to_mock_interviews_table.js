exports.up = async function (knex) {
  const hasColumn = await knex.schema.hasColumn('mock_interviews', 'job_role');
  if (!hasColumn) {
    await knex.schema.alterTable('mock_interviews', function (table) {
      table.string('job_role').nullable();
    });
  }
};

exports.down = async function (knex) {
  const hasColumn = await knex.schema.hasColumn('mock_interviews', 'job_role');
  if (hasColumn) {
    await knex.schema.alterTable('mock_interviews', function (table) {
      table.dropColumn('job_role');
    });
  }
};
