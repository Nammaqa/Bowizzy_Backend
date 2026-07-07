const UserCredits = require("../models/UserCredits");
const User = require("../models/User");
const UserPayment = require("../models/UserPayment");
const razorpay = require("../utils/razorpay");
const crypto = require("crypto");

exports.getUserCredits = async (req, res) => {
  try {
    const { user_id } = req.params;

    const credits = await UserCredits.query()
      .where("user_id", user_id)
      .first();

    if (!credits) {
      return res.status(404).json({ message: "User credits not found" });
    }

    const user = await User.query().findById(user_id);

    return res.json({
      credits,
      coupon_code: user ? user.coupon_code || null : null,
      count: user ? (user.count ?? null) : null,
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error fetching user credits" });
  }
};

exports.getAllUsersCredits = async (req, res) => {
  try {
    if (req.user.user_type !== "admin") {
      return res.status(403).json({ message: "Access denied" });
    }

    const list = await UserCredits.query()
      .select(
        "user_credits.id",
        "user_credits.user_id",
        "user_credits.credits",
        "user_credits.created_at",
        "user_credits.updated_at"
      )
      .orderBy('user_id', 'asc');

    return res.json(list);

  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error fetching user credits" });
  }
};

exports.addCredits = async (req, res) => {
  try {
    if (req.user.user_type !== "admin") {
      return res.status(403).json({ message: "Access denied" });
    }

    const { user_id } = req.params;
    const { amount } = req.body;

    if (!amount || amount <= 0) {
      return res.status(400).json({ message: "Invalid amount. Must be greater than 0" });
    }

    let userCredits = await UserCredits.query()
      .where("user_id", user_id)
      .first();

    if (!userCredits) {
      userCredits = await UserCredits.query().insert({
        user_id,
        credits: amount
      });
      return res.status(201).json({
        message: "Credits added successfully",
        data: userCredits
      });
    }

    const updated = await UserCredits.query()
      .where("user_id", user_id)
      .increment("credits", amount)
      .returning("*");

    return res.json({
      message: "Credits added successfully",
      data: updated[0]
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error adding credits" });
  }
};

exports.deductCredits = async (req, res) => {
  try {
    if (req.user.user_type !== "admin") {
      return res.status(403).json({ message: "Access denied" });
    }

    const { user_id } = req.params;
    const { amount } = req.body;

    if (!amount || amount <= 0) {
      return res.status(400).json({ message: "Invalid amount. Must be greater than 0" });
    }

    const userCredits = await UserCredits.query()
      .where("user_id", user_id)
      .first();

    if (!userCredits) {
      return res.status(404).json({ message: "User credits not found" });
    }

    if (userCredits.credits < amount) {
      return res.status(400).json({
        message: "Insufficient credits",
        available: userCredits.credits,
        requested: amount
      });
    }

    const updated = await UserCredits.query()
      .where("user_id", user_id)
      .decrement("credits", amount)
      .returning("*");

    return res.json({
      message: "Credits deducted successfully",
      data: updated[0]
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error deducting credits" });
  }
};

exports.updateCredits = async (req, res) => {
  try {
    if (req.user.user_type !== "admin") {
      return res.status(403).json({ message: "Access denied" });
    }

    const { user_id } = req.params;
    const { credits } = req.body;

    if (credits === undefined || credits < 0) {
      return res.status(400).json({ message: "Invalid credits value" });
    }

    let userCredits = await UserCredits.query()
      .where("user_id", user_id)
      .first();

    if (!userCredits) {
      userCredits = await UserCredits.query().insert({
        user_id,
        credits
      });
      return res.status(201).json({
        message: "Credits updated successfully",
        data: userCredits
      });
    }

    const updated = await UserCredits.query()
      .where("user_id", user_id)
      .patch({ credits })
      .returning("*");

    return res.json({
      message: "Credits updated successfully",
      data: updated[0]
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error updating credits" });
  }
};

exports.createCreditPurchaseOrder = async (req, res) => {
  try {
    const { user_id } = req.params;
    const { amount, currency = "INR" } = req.body;

    if (!user_id) {
      return res.status(400).json({ message: "User id is required" });
    }

    if (!amount || Number(amount) <= 0) {
      return res.status(400).json({ message: "Invalid amount" });
    }

    const purchasedCredits = Math.floor(Number(amount) *2 ); // Assuming 1 credit = 10 currency units

    const user = await User.query().findById(user_id);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const paise = Math.round(Number(amount) * 100);
    const order = await razorpay.orders.create({
      amount: paise,
      currency,
      receipt: `credits_${user_id}_${Date.now()}`
    });

    await UserPayment.query().insert({
      user_id,
      razorpay_order_id: order.id,
      amount: Number(amount),
      currency,
      status: "created",
      plan_type: "credits"
    });

    return res.status(200).json({
      message: "Credit purchase order created successfully",
      order,
      purchasedCredits: Number(purchasedCredits),
      amount: Number(amount)
    });
  } catch (err) {
    console.error("Create credit purchase order error:", err);
    return res.status(500).json({ message: "Failed to create credit purchase order" });
  }
};

exports.verifyCreditPurchase = async (req, res) => {
  try {
    const { user_id } = req.params;
    const {
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
      amount,
      purchasedCredits
    } = req.body;

    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return res.status(400).json({ message: "Missing Razorpay payment details" });
    }

    const body = razorpay_order_id + "|" + razorpay_payment_id;
    const expected = crypto
      .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
      .update(body)
      .digest("hex");

    if (expected !== razorpay_signature) {
      await UserPayment.query().patch({ status: "failed" }).where({ razorpay_order_id });
      return res.status(400).json({ message: "Payment verification failed" });
    }

    const payment = await UserPayment.query().findOne({ razorpay_order_id });
    if (!payment) {
      return res.status(404).json({ message: "Payment order not found" });
    }

    const creditsToAdd = Number(purchasedCredits || amount || 0);
    const user = await User.query().findById(user_id);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    await UserPayment.query()
      .patch({
        status: "success",
        razorpay_payment_id,
        razorpay_signature
      })
      .where({ razorpay_order_id });


    const updatedPurchasedCredits = Number(user.purchased_credits || 0) + creditsToAdd;
    const updatedBonusCredits = Number(user.credits || 0) + Math.floor(creditsToAdd * 0.1);
    await User.query().patch({ purchased_credits: updatedPurchasedCredits }).where({ user_id });
    await User.query().patch({ credits: updatedBonusCredits }).where({ user_id });

    return res.status(200).json({
      message: "Credit purchase verified successfully",
      purchased_credits: updatedPurchasedCredits
    });
  } catch (err) {
    console.error("Verify credit purchase error:", err);
    return res.status(500).json({ message: "Failed to verify credit purchase" });
  }
};

exports.getCreditHistory = async (req, res) => {
  try {
    const { user_id } = req.params;
    const user = await User.query().findById(user_id);

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }
    const history = await UserCredits.query()
      .where("user_id", user_id)
      .orderBy("created_at", "desc");

    return res.json(history);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error fetching credit history" });
  }
};