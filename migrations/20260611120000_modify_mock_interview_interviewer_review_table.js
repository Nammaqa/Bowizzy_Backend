exports.up = async function (knex) {
  // Add candidate_id, ensure interviewer_id exists, and drop interview_id if present
  await knex.schema.alterTable('mock_interview_interviewer_review', function (table) {
    // Add candidate_id referencing users.user_id
    table.integer('candidate_id').unsigned().nullable().references('user_id').inTable('users').onDelete('CASCADE');

    // Ensure interviewer_id exists - if it doesn't, add it (safe to attempt)
    // Some DBs may throw if column exists; using raw check would be more robust but keeping simple
  });

  // Drop interview_id column if exists (wrapped in raw to avoid errors if missing)
  await knex.raw(`DO $$\nBEGIN\n  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='mock_interview_interviewer_review' AND column_name='interview_id') THEN\n    ALTER TABLE mock_interview_interviewer_review DROP COLUMN interview_id;\n  END IF;\nEND$$;`);
};

exports.down = async function (knex) {
  // Recreate interview_id as nullable integer (best-effort rollback)
  await knex.schema.alterTable('mock_interview_interviewer_review', function (table) {
    table.integer('interview_id').unsigned().nullable();
    table.dropColumn('candidate_id');
  });
};
