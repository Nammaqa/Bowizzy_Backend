const { Model } = require("objection");
const db = require("../db/knex");

Model.knex(db);

class CandidateReview extends Model {
  static get tableName() {
    return "mock_interview_candidate_reviews";
  }

  static get idColumn() {
    return "mock_interview_candidate_review_id";
  }
}

module.exports = CandidateReview;
