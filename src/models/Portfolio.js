const { Model } = require("objection");
const db = require("../db/knex");

Model.knex(db);

class Portfolio extends Model {
  static get tableName() {
    return "portfolio";
  }

  static get idColumn() {
    return "portfolio_id";
  }
}

module.exports = Portfolio;
