exports.up = async function (knex) {
  await knex.schema.alterTable('mock_interviews', function (table) {
    table.text('skills').nullable();
  });
};

exports.down = async function (knex) {
  await knex.schema.alterTable('mock_interviews', function (table) {
    table.dropColumn('skills');
  });
};
