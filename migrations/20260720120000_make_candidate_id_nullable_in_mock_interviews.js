exports.up = async function (knex) {
  await knex.schema.alterTable('mock_interviews', function (table) {
    table.integer('candidate_id').unsigned().nullable().alter();
  });
};

exports.down = async function (knex) {
  await knex.schema.alterTable('mock_interviews', function (table) {
    table.integer('candidate_id').unsigned().notNullable().alter();
  });
};
