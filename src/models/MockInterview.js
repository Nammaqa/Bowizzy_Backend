const { Model } = require("objection");
const db = require("../db/knex");

Model.knex(db);

class MockInterview extends Model {
  static get tableName() {
    return "mock_interviews";
  }

  static get idColumn() {
    return "mock_interview_id";
  }
}

module.exports = MockInterview;
