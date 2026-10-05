exports.up = async function (knex) {
  await knex("users")
    .where("is_interviewer_banned", false)
    .update({
      interviewer_deactivated_by: null,
      interviewer_deactivated_at: null
    });
};

exports.down = async function () {};
