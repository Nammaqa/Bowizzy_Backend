exports.up = async function (knex) {
  await knex("users")
    .where("is_interviewer_banned", true)
    .whereNull("interviewer_deactivated_by")
    .update({
      interviewer_deactivated_by: "admin",
      interviewer_deactivated_at: knex.fn.now()
    });
};

exports.down = async function () {};