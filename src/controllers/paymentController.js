const razorpay = require("../utils/razorpay");
const crypto = require("crypto");
const UserPayment = require("../models/UserPayment");
const UserSubscription = require("../models/UserSubscription");



// CREATE ORDER
exports.createOrder = async (req, res) => {
  try {
    const { amount, plan_type, breakdown, credits_applied, purchased_credits_used, bonus_credits_used } = req.body;
    const user_id = req.user.user_id;

    const parsedAmount = Number(amount) || 0;
    const purchasedCredits = purchased_credits_used ? Math.round(Number(purchased_credits_used)) : 0;
    const bonusCredits = bonus_credits_used ? Math.round(Number(bonus_credits_used)) : 0;

    // validate amount
    if (isNaN(parsedAmount) || parsedAmount < 0) {
      return res.status(400).json({ message: "Invalid amount" });
    }

    let order_id;
    let payment_status = "created";
    let order_response = {};

    if (parsedAmount === 0) {
      // Bypass razorpay for 0 amount
      order_id = `free_order_${Date.now()}`;
      payment_status = "success";
      order_response = {
        id: order_id,
        amount: 0,
        currency: "INR",
        status: "created"
      };

      // Deduct immediately since no verify for amount=0
      if (purchasedCredits > 0) {
        await UserPayment.query().knex()('users').where({ user_id }).decrement('purchased_credits', purchasedCredits);
      }
      if (bonusCredits > 0) {
        await UserPayment.query().knex()('users').where({ user_id }).decrement('credits', bonusCredits);
      }

      // ✅ ADD 5 BONUS CREDITS FOR FULLY CREDIT-COVERED (BYPASSED) ORDERS
      await UserPayment.query().knex()('credit_transactions').insert({
        user_id,
        credits: 5,
        transaction_type: "welcome_bonus",
        description: `Bonus credits for bypassed payment ${order_id}`,
        reference_id: null
      });

      await UserPayment.query().knex()('users')
        .where({ user_id })
        .increment('credits', 5);
    } else {
      // Razorpay needs paise
      const paise = Math.round(parsedAmount * 100);
      const order = await razorpay.orders.create({
        amount: paise,
        currency: "INR",
        receipt: `rcpt_${Date.now()}`
      });
      order_id = order.id;
      order_response = order;
    }

    // ✅ STORE RUPEES IN DB with breakdown details
    await UserPayment.query().insert({
      user_id,
      razorpay_order_id: order_id,
      amount: parsedAmount,
      currency: "INR",
      status: payment_status,
      plan_type,
      credits_applied: credits_applied ? Number(credits_applied) : null,
      purchased_credits_applied: purchasedCredits > 0 ? purchasedCredits : null,
      bonus_credits_applied: bonusCredits > 0 ? bonusCredits : null,
      base_price: breakdown?.basePrice ? Number(breakdown.basePrice) : null,
      credit_discount: breakdown?.creditDiscount ? Number(breakdown.creditDiscount) : null,
      cgst: breakdown?.cgst ? Number(breakdown.cgst) : null,
      sgst: breakdown?.sgst ? Number(breakdown.sgst) : null
    });

    return res.json(order_response);

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
    const bonusToDeduct = Math.round(payment.bonus_credits_applied ? Number(payment.bonus_credits_applied) : (credits_applied ? Number(credits_applied) : 0));
    if (bonusToDeduct > 0 && payment) {
      await UserPayment.query().knex()('credit_transactions').insert({
        user_id: payment.user_id,
        credits: bonusToDeduct,
        transaction_type: "credit_applied",
        description: `Credits applied from payment ${razorpay_order_id}`,
        reference_id: null
      });

      // ✅ DECREASE CREDITS FROM USER TABLE
      await UserPayment.query().knex()('users')
        .where({ user_id: payment.user_id })
        .decrement('credits', bonusToDeduct);
    }

    // ✅ DECREASE PURCHASED CREDITS IF APPLIED
    if (payment.purchased_credits_applied && Number(payment.purchased_credits_applied) > 0) {
      const purchasedToDeduct = Math.round(Number(payment.purchased_credits_applied));
      await UserPayment.query().knex()('users')
        .where({ user_id: payment.user_id })
        .decrement('purchased_credits', purchasedToDeduct);
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

