const User = require("../models/User");

exports.getUserById = async (req, res) => {
  try {
    const { user_id } = req.params;

    const user = await User.query().findById(user_id);

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    return res.json(user);

  } catch (err) {
    res.status(500).json({ message: "Error fetching user" });
  }
};

exports.claimWelcomeCredit = async (req, res) => {
  const trx = await User.startTransaction();
  try {
    const user_id = req.user && req.user.user_id; 
    const user = await User.query(trx).findById(user_id);
    if (!user) {
      await trx.rollback();
      return res.status(404).json({ message: "User not found" });
    }
    if (user.welcomeBonusRedeemed) {
      await trx.rollback();
      return res.status(400).json({ message: "Welcome bonus already redeemed" });
    }
    const amount = process.env.WELCOME_BONUS_COINS || 25;
    await trx('credit_transactions').insert({
      user_id,
      credits:amount,
      transaction_type: "welcome_bonus",
      description: "Welcome bonus coins for new users"
    });
    await User.query(trx).findById(user_id).patch({ welcomeBonusRedeemed: true, credits: user.credits + amount });
    await trx.commit();
    return res.json({ message: "Welcome bonus claimed successfully" });
  } catch (err) {
    await trx.rollback();
    console.error("Error claiming welcome bonus:", err);
    res.status(500).json({ message: "Error claiming welcome bonus" });
  }
};

exports.deleteAccount = async (req, res) => {
  const trx = await User.startTransaction();
  try {
    const { user_id } = req.params;

    const user = await User.query(trx).findById(user_id);

    if (!user) {
      await trx.rollback();
      return res.status(404).json({ message: "User not found" });
    }

    const deletedEmail = user.email ? `deleted_${user.email}` : null;
    const deletedPhone = user.phone_number ? `deleted_${user.phone_number}` : null;

    await User.query(trx).findById(user_id).patch({
      is_user_deleted: true,
      email: deletedEmail,
      phone_number: deletedPhone
    });

    await trx.commit();
    return res.json({ message: "Account deleted successfully" });
  } catch (err) {
    await trx.rollback();
    console.error("Error deleting account:", err);
    res.status(500).json({ message: "Error deleting account" });
  }
}