exports.up = async function (knex) {
  await knex.raw(`
    DO $$
    BEGIN
      IF EXISTS (
        SELECT 1
        FROM pg_type
        WHERE typname = 'mock_interview_status_enum'
      ) THEN
        IF NOT EXISTS (
          SELECT 1
          FROM pg_enum
          WHERE enumtypid = 'mock_interview_status_enum'::regtype
          AND enumlabel = 'completed'
        ) THEN
          ALTER TYPE mock_interview_status_enum ADD VALUE 'completed';
        END IF;
      END IF;
    END$$;
  `);
};

exports.down = async function (knex) {
  // PostgreSQL does not support removing enum values easily.
  // This is intentionally kept as a no-op for safety.
};
