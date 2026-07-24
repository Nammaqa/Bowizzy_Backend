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

exports.markEnhanceUsed = async (req, res) => {
  try {
    const user_id = req.user?.user_id;

    if (!user_id) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const user = await User.query().findById(user_id);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const currentLeft = Number(user.enhance_usage_left || 0);

    if (currentLeft <= 0) {
      await User.query()
        .patch({ enhance_usage_left: 0 })
        .where({ user_id });

      return res.status(200).json({
        message: "Enhance usage exhausted",
        enhance_usage_left: 0
      });
    }

    const nextLeft = currentLeft - 1;

    await User.query()
      .patch({ enhance_usage_left: nextLeft })
      .where({ user_id });

    return res.status(200).json({
      message: "Enhance usage marked successfully",
      enhance_usage_left: nextLeft
    });
  } catch (err) {
    console.error("Mark enhance used Error:", err);
    return res.status(500).json({ message: "Failed to update enhance usage" });
  }
};

exports.checkEnhanceUsed = async (req, res) => {
  try {
    const user_id = req.user?.user_id;

    if (!user_id) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const user = await User.query().findById(user_id);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    return res.status(200).json({
      message: "Enhance usage status fetched successfully",
      isBonus_enhance_used: Boolean(user.isBonus_enhance_used),
      enhance_usage_left: Number(user.enhance_usage_left || 0)
    });
  } catch (err) {
    console.error("Check enhance used Error:", err);
    return res.status(500).json({ message: "Failed to check enhance usage" });
  }
};

exports.redeemEnhanceWithBonus = async (req, res) => {
  try {
    const user_id = req.user?.user_id;

    if (!user_id) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const user = await User.query().findById(user_id);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const updatedUsageLeft = Number(user.enhance_usage_left || 0) + 5;
    await User.query()
      .patch({
        credits: Number(user.credits) - 5
      })
      .where({ user_id });
    await User.query()
      .patch({
        isBonus_enhance_used: true,
        enhance_usage_left: updatedUsageLeft
      })
      .where({ user_id });


    return res.status(200).json({
      message: "Enhance bonus redeemed successfully",
      isBonus_enhance_used: true,
      enhance_usage_left: updatedUsageLeft
    });
  } catch (err) {
    console.error("Redeem enhance with bonus Error:", err);
    return res.status(500).json({ message: "Failed to redeem enhance bonus" });
  }
};

exports.redeemEnhanceWithPurchasedCredits = async (req, res) => {
  try {
    const user_id = req.user?.user_id;

    if (!user_id) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const creditsRequested = Number(req.body.credits || req.body.credits_to_use || 0);
    if (creditsRequested <= 0) {
      return res.status(400).json({
        message: "Please specify a valid number of purchased credits to use."
      });
    }

    const user = await User.query().findById(user_id);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const purchasedCredits = Number(user.purchased_credits || 0);
    if (purchasedCredits <= 0) {
      return res.status(400).json({
        message: "You do not have any purchased credits. Please recharge."
      });
    }

    const creditsToUse = Math.min(purchasedCredits, creditsRequested);
    const updatedPurchasedCredits = purchasedCredits - creditsToUse;
    const updatedUsageLeft = Number(user.enhance_usage_left || 0) + creditsToUse;
// 
    await User.query()
      .patch({
        purchased_credits: updatedPurchasedCredits,
        enhance_usage_left: updatedUsageLeft
      })
      .where({ user_id });

    return res.status(200).json({
      message: `Enhance redeemed with purchased credits successfully. Used ${creditsToUse} purchased credit(s).`,
      credits_used: creditsToUse,
      purchased_credits: updatedPurchasedCredits,
      enhance_usage_left: updatedUsageLeft
    });
  } catch (err) {
    console.error("Redeem enhance with purchased credits Error:", err);
    return res.status(500).json({ message: "Failed to redeem enhance with purchased credits" });
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

// email and phone_number are UNIQUE columns, so the tombstoned value has to be
// unique across every deletion — including a brand new account that reuses the
// same email as a previously deleted one. user_id + timestamp guarantees that.
const MAX_COLUMN_LENGTH = 255;

const buildDeletedValue = (value, user_id) => {
  if (!value) return null;

  // Strip any prefix from an earlier deletion so it doesn't stack on re-delete.
  // Covers the legacy formats too: "deleted_x", "deleted_1_x", "deleted_9_173..._x".
  const original = String(value).replace(/^deleted_(\d+_)*/, "");
  const prefix = `deleted_${user_id}_${Date.now()}_`;

  return `${prefix}${original}`.slice(0, MAX_COLUMN_LENGTH);
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

    const deletedEmail = buildDeletedValue(user.email, user_id);
    const deletedPhone = buildDeletedValue(user.phone_number, user_id);

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