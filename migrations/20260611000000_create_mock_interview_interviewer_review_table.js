exports.up = async function (knex) {
  await knex.schema.createTable("mock_interview_interviewer_review", function (table) {
    table.increments("mock_interview_interviewer_review_id").primary();

    table
      .integer("interviewer_id")
      .unsigned()
      .notNullable()
      .references("user_id")
      .inTable("users")
      .onDelete("CASCADE");

    table
      .integer("mock_interview_id")
      .unsigned()
      .notNullable()
      .references("mock_interview_id")
      .inTable("mock_interviews")
      .onDelete("CASCADE");

    table.text("professionalism_conduct");
    table.text("clarity_of_questions");
    table.text("knowledge_of_role");
    table.text("engagement_during_interview");
    table.text("timeliness_organization");
    table.text("overall_experience");
    table.text("final_comments");

    table.enu("professionalism_conduct_rating", [1, 2, 3, 4, 5]);
    table.enu("clarity_of_questions_rating", [1, 2, 3, 4, 5]);
    table.enu("knowledge_of_role_rating", [1, 2, 3, 4, 5]);
    table.enu("engagement_during_interview_rating", [1, 2, 3, 4, 5]);
    table.enu("timeliness_organization_rating", [1, 2, 3, 4, 5]);
    table.enu("overall_experience_rating", [1, 2, 3, 4, 5]);

    table.timestamps(true, true);
  });
};

exports.down = async function (knex) {
  await knex.schema.dropTableIfExists("mock_interview_interviewer_review");
};
