const razorpay = require("../utils/razorpay");
const crypto = require("crypto");
const UserPayment = require("../models/UserPayment");
const UserSubscription = require("../models/UserSubscription");



// CREATE ORDER
exports.createOrder = async (req, res) => {
  try {
    const { amount, plan_type, breakdown, credits_applied } = req.body;
    const user_id = req.user.user_id;

    // validate rupees
    if (!amount || isNaN(amount) || Number(amount) <= 0) {
      return res.status(400).json({ message: "Invalid amount" });
    }

    // Razorpay needs paise
    const paise = Math.round(Number(amount) * 100);

    const order = await razorpay.orders.create({
      amount: paise,
      currency: "INR",
      receipt: `rcpt_${Date.now()}`
    });

    // ✅ STORE RUPEES IN DB with breakdown details
    await UserPayment.query().insert({
      user_id,
      razorpay_order_id: order.id,
      amount: Number(amount),   // ₹100 stays 100
      currency: "INR",
      status: "created",
      plan_type,
      credits_applied: credits_applied ? Number(credits_applied) : null,
      base_price: breakdown?.basePrice ? Number(breakdown.basePrice) : null,
      credit_discount: breakdown?.creditDiscount ? Number(breakdown.creditDiscount) : null,
      cgst: breakdown?.cgst ? Number(breakdown.cgst) : null,
      sgst: breakdown?.sgst ? Number(breakdown.sgst) : null
    });

    return res.json(order);

  } catch (err) {
    console.error("createOrder error:", err);
    return res.status(500).json({ message: "Order creation failed" });
  }
};


// VERIFY PAYMENT + UPDATE SUBSCRIPTION
exports.verifyPayment = async (req, res) => {
  try {
    const {
      interview_id,
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
      credits_applied
    } = req.body;

    const body = razorpay_order_id + "|" + razorpay_payment_id;

    const expected = crypto
      .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
      .update(body)
      .digest("hex");

    if (expected !== razorpay_signature) {
      await UserPayment.query()
        .patch({ status: "failed" })
        .where({ razorpay_order_id });

      return res.status(400).json({ message: "Payment verification failed" });
    }

    // Get user_id from payment record
    const payment = await UserPayment.query().findOne({ razorpay_order_id });

    // ✅ ONLY UPDATE PAYMENT
    await UserPayment.query()
      .patch({
        status: "success",
        razorpay_payment_id,
        razorpay_signature
      })
      .where({ razorpay_order_id });

    



    // ✅ ADD COIN TRANSACTION IF CREDITS APPLIED > 0
    if (credits_applied && Number(credits_applied) > 0 && payment) {
      await UserPayment.query().knex()('credit_transactions').insert({
        user_id: payment.user_id,
        credits: Number(credits_applied),
        transaction_type: "credit_applied",
        description: `Credits applied from payment ${razorpay_order_id}`,
        reference_id: null
      });

      // ✅ DECREASE CREDITS FROM USER TABLE
      await UserPayment.query().knex()('users')
        .where({ user_id: payment.user_id })
        .decrement('credits', Number(credits_applied));
    }
    const userId = payment?.user_id || req.user?.user_id;

    // ✅ ADD 5 BONUS CREDITS FOR EVERY VERIFIED PAYMENT
    if (userId) {
      await UserPayment.query().knex()('credit_transactions').insert({
        user_id: userId,
        credits: 5,
        transaction_type: "welcome_bonus",
        description: `Bonus credits for verified payment ${razorpay_order_id}`,
        reference_id: null
      });

      await UserPayment.query().knex()('users')
        .where({ user_id: userId })
        .increment('credits', 5);
    }

    return res.json({
      message: "Payment successful"
    });

  } catch (err) {
    console.error("verifyPayment error:", err);
    return res.status(500).json({ message: "Verification error" });
  }
};

exports.handleWebhook = async (req, res) => {
  try {
    const event = req.body;

    if (event.event === "payment.captured") {
      const payment = event.payload.payment.entity;

      await UserPayment.query()
        .patch({ status: "success" })
        .where({ razorpay_payment_id: payment.id });
    }

    if (event.event === "payment.failed") {
      const payment = event.payload.payment.entity;

      await UserPayment.query()
        .patch({ status: "failed" })
        .where({ razorpay_payment_id: payment.id });
    }

    return res.status(200).json({ received: true });

  } catch (err) {
    console.error("Webhook error:", err);
    return res.status(500).json({ message: "Webhook error" });
  }
};

