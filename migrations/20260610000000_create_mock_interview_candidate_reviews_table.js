exports.up = async function (knex) {
  // Create new table for mock interview candidate reviews
  await knex.schema.createTable("mock_interview_candidate_reviews", function (table) {
    table.increments("mock_interview_candidate_review_id").primary();

    table
      .integer("mock_interview_id")
      .unsigned()
      .notNullable()
      .references("mock_interview_id")
      .inTable("mock_interviews")
      .onDelete("CASCADE");

    table
      .integer("candidate_id")
      .unsigned()
      .notNullable()
      .references("user_id")
      .inTable("users")
      .onDelete("CASCADE");

    table
      .integer("interviewer_id")
      .unsigned()
      .notNullable()
      .references("user_id")
      .inTable("users")
      .onDelete("CASCADE");

    table.text("communication_skills");               
    table.text("technical_knowledge");                
    table.text("problem_solving_analytical_skills");  
    table.text("relevant_experience_skills");         
    table.text("adaptability_learning_ability");      
    table.text("cultural_team_fit");                  
    table.text("overall_impression");                 
    table.text("final_comments");                     

    table
      .enu("final_recommendation", [
        "highly_recommend",
        "recommend",
        "neutral",
        "not_recommend",
      ]);

    table.enu("communication_skills_rating", [1, 2, 3, 4, 5]);
    table.enu("technical_knowledge_rating", [1, 2, 3, 4, 5]);
    table.enu("problem_solving_analytical_skills_rating", [1, 2, 3, 4, 5]);
    table.enu("relevant_experience_skills_rating", [1, 2, 3, 4, 5]);
    table.enu("adaptability_learning_ability_rating", [1, 2, 3, 4, 5]);
    table.enu("cultural_team_fit_rating", [1, 2, 3, 4, 5]);
    table.enu("overall_impression_rating", [1, 2, 3, 4, 5]);

    table.timestamps(true, true);
  });

  // Drop the old candidate_reviews table
  await knex.schema.dropTableIfExists("candidate_reviews");
};

exports.down = async function (knex) {
  // Recreate the old candidate_reviews table for rollback
  await knex.schema.createTable("candidate_reviews", function (table) {
    table.increments("candidate_review_id").primary();

    table
      .integer("interview_schedule_id")
      .unsigned()
      .notNullable()
      .references("interview_schedule_id")
      .inTable("interview_schedules")
      .onDelete("CASCADE");

    table
      .integer("candidate_id")
      .unsigned()
      .notNullable()
      .references("user_id")
      .inTable("users")
      .onDelete("CASCADE");

    table
      .integer("interviewer_id")
      .unsigned()
      .notNullable()
      .references("user_id")
      .inTable("users")
      .onDelete("CASCADE");

    table.text("communication_skills");               
    table.text("technical_knowledge");                
    table.text("problem_solving_analytical_skills");  
    table.text("relevant_experience_skills");         
    table.text("adaptability_learning_ability");      
    table.text("cultural_team_fit");                  
    table.text("overall_impression");                 
    table.text("final_comments");                     

    table
      .enu("final_recommendation", [
        "highly_recommend",
        "recommend",
        "neutral",
        "not_recommend",
      ]);

    table.enu("communication_skills_rating", [1, 2, 3, 4, 5]);
    table.enu("technical_knowledge_rating", [1, 2, 3, 4, 5]);
    table.enu("problem_solving_analytical_skills_rating", [1, 2, 3, 4, 5]);
    table.enu("relevant_experience_skills_rating", [1, 2, 3, 4, 5]);
    table.enu("adaptability_learning_ability_rating", [1, 2, 3, 4, 5]);
    table.enu("cultural_team_fit_rating", [1, 2, 3, 4, 5]);
    table.enu("overall_impression_rating", [1, 2, 3, 4, 5]);

    table.timestamps(true, true);
  });

  // Drop the new mock_interview_candidate_reviews table
  await knex.schema.dropTableIfExists("mock_interview_candidate_reviews");
};
