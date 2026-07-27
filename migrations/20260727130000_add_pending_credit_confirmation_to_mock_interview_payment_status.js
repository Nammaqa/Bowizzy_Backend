exports.up = async function (knex) {
  await knex.raw(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1
        FROM pg_type t
        JOIN pg_enum e ON t.oid = e.enumtypid
        WHERE t.typname = 'mock_interview_payment_status_enum'
          AND e.enumlabel = 'pending_credit_confirmation'
      ) THEN
        ALTER TYPE mock_interview_payment_status_enum
          ADD VALUE 'pending_credit_confirmation';
      END IF;
    END$$;
  `);
};

exports.down = async function (knex) {
  // PostgreSQL does not support dropping enum values directly in a simple way.
  // This migration intentionally leaves the enum value in place for safety.
};
