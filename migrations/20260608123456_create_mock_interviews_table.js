exports.up = async function (knex) {
  await knex.raw(`
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'mock_interview_status_enum') THEN
        CREATE TYPE mock_interview_status_enum AS ENUM ('confirmed', 'cancelled_by_interviewer', 'cancelled_by_candidate', 'pending');
      END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'mock_interview_type_enum') THEN
        CREATE TYPE mock_interview_type_enum AS ENUM ('online', 'offline');
      END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'mock_interview_payment_status_enum') THEN
        CREATE TYPE mock_interview_payment_status_enum AS ENUM ('pending', 'failed', 'confirmed');
      END IF;
    END$$;
  `);

  await knex.schema.createTable('mock_interviews', function (table) {
    table.increments('mock_interview_id').primary();
    table.integer('candidate_id').unsigned().notNullable()
      .references('user_id').inTable('users').onDelete('CASCADE');
    table.integer('interviewer_id').unsigned().nullable()
      .references('user_id').inTable('users').onDelete('SET NULL');
    table.specificType('interview_status', 'mock_interview_status_enum')
      .notNullable().defaultTo('pending');
    table.timestamp('start_time_utc', { useTz: true }).notNullable();
    table.timestamp('end_time_utc', { useTz: true }).notNullable();
    table.string('meeting_link');
    table.specificType('interview_type', 'mock_interview_type_enum').notNullable();
    table.specificType('payment_status', 'mock_interview_payment_status_enum')
      .notNullable().defaultTo('pending');
    table.string('resume_url');
    table.integer('experience_months').unsigned();
    table.decimal('amount', 10, 2).notNullable().defaultTo(0);
    table.string('razorpay_order_id');
    table.string('razorpay_payment_id');
    table.string('razorpay_signature');
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.raw('now()'));
    table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.raw('now()'));
    table.check('start_time_utc < end_time_utc');
  });

  await knex.raw(`
    CREATE INDEX idx_mock_interviews_candidate_start
      ON mock_interviews (candidate_id, start_time_utc);
  `);

  await knex.raw(`
    CREATE INDEX idx_mock_interviews_interviewer_start
      ON mock_interviews (interviewer_id, start_time_utc);
  `);
};

exports.down = async function (knex) {
  await knex.raw(`DROP INDEX IF EXISTS idx_mock_interviews_interviewer_start;`);
  await knex.raw(`DROP INDEX IF EXISTS idx_mock_interviews_candidate_start;`);
  await knex.schema.dropTableIfExists('mock_interviews');
  await knex.raw(`DROP TYPE IF EXISTS mock_interview_status_enum;`);
  await knex.raw(`DROP TYPE IF EXISTS mock_interview_type_enum;`);
  await knex.raw(`DROP TYPE IF EXISTS mock_interview_payment_status_enum;`);
};
