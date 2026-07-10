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

exports.deleteAccount = async (req, res) => {
  const trx = await User.startTransaction();
  try {
    const { user_id } = req.params;

    const user = await User.query(trx).findById(user_id);

    if (!user) {
      await trx.rollback();
      return res.status(404).json({ message: "User not found" });
    }

    // Handle email deletion with counter
    let deletedEmail = null;
    if (user.email) {
      if (user.email.startsWith("deleted_")) {
        // Already deleted, add a counter
        const match = user.email.match(/^deleted_(\d+)_/);
        if (match) {
          const counter = parseInt(match[1]) + 1;
          const originalEmail = user.email.replace(/^deleted_\d+_/, "");
          deletedEmail = `deleted_${counter}_${originalEmail}`;
        } else {
          // First re-deletion
          const originalEmail = user.email.replace(/^deleted_/, "");
          deletedEmail = `deleted_1_${originalEmail}`;
        }
      } else {
        deletedEmail = `deleted_${user.email}`;
      }
    }

    // Handle phone deletion with counter
    let deletedPhone = null;
    if (user.phone_number) {
      if (user.phone_number.startsWith("deleted_")) {
        // Already deleted, add a counter
        const match = user.phone_number.match(/^deleted_(\d+)_/);
        if (match) {
          const counter = parseInt(match[1]) + 1;
          const originalPhone = user.phone_number.replace(/^deleted_\d+_/, "");
          deletedPhone = `deleted_${counter}_${originalPhone}`;
        } else {
          // First re-deletion
          const originalPhone = user.phone_number.replace(/^deleted_/, "");
          deletedPhone = `deleted_1_${originalPhone}`;
        }
      } else {
        deletedPhone = `deleted_${user.phone_number}`;
      }
    }

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