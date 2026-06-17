const { Model } = require("objection");
const db = require("../db/knex");

Model.knex(db);

class MockInterviewInterviewerReview extends Model {
  static get tableName() {
    return "mock_interview_interviewer_review";
  }

  static get idColumn() {
    return "mock_interview_interviewer_review_id";
  }
}

module.exports = MockInterviewInterviewerReview;
