exports.up = async function (knex) {
  // Create enums if they don't exist
  await knex.raw(`
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'mock_interview_priority_enum') THEN
        CREATE TYPE mock_interview_priority_enum AS ENUM ('normal', 'priority');
      END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'mock_interview_cancelled_by_enum') THEN
        CREATE TYPE mock_interview_cancelled_by_enum AS ENUM ('candidate', 'interviewer');
      END IF;
    END$$;
  `);

  // Add new columns to mock_interviews table
  await knex.schema.alterTable('mock_interviews', function (table) {
    table.boolean('candidate_feedback_given').defaultTo(false).notNullable();
    table.boolean('interviewer_feedback_given').defaultTo(false).notNullable();
    table.specificType('priority_status', 'mock_interview_priority_enum').defaultTo('normal');
    table.specificType('cancelled_by', 'mock_interview_cancelled_by_enum').nullable();
  });
};

exports.down = async function (knex) {
  // Drop columns from mock_interviews table
  await knex.schema.alterTable('mock_interviews', function (table) {
    table.dropColumn('candidate_feedback_given');
    table.dropColumn('interviewer_feedback_given');
    table.dropColumn('priority_status');
    table.dropColumn('cancelled_by');
  });

  // Drop enums
  await knex.raw(`DROP TYPE IF EXISTS mock_interview_priority_enum;`);
  await knex.raw(`DROP TYPE IF EXISTS mock_interview_cancelled_by_enum;`);
};
