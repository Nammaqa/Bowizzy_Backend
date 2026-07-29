const razorpay = require("../utils/razorpay");
const crypto = require("crypto");
const Portfolio = require("../models/Portfolio");
const UserPayment = require("../models/UserPayment");
const User = require("../models/User");

const awardBonusCredits = async (userId, referenceId, description) => {
  if (!userId) return;

  const knex = UserPayment.query().knex();

  await knex("credit_transactions").insert({
    user_id: userId,
    credits: 5,
    transaction_type: "welcome_bonus",
    description: description || `Bonus credits for portfolio payment ${referenceId}`,
    reference_id: referenceId || null,
  });

  await knex("users")
    .where({ user_id: userId })
    .increment("credits", 5);
};

// CREATE RAZORPAY ORDER FOR PORTFOLIO
exports.createOrder = async (req, res) => {
  try {
    const { amount, credits_used, purchased_credits_used, bonus_credits_used, portfolio_type } = req.body;
    const user_id = req.user.user_id;

    if (!portfolio_type) {
      return res.status(400).json({ message: "Portfolio type is required" });
    }

    const purchasedToUse = Number(purchased_credits_used) || 0;
    const bonusToUse = Number(bonus_credits_used) || 0;

    const user = await User.query().findById(user_id);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    if (purchasedToUse > 0 && (user.purchased_credits ?? 0) < purchasedToUse) {
      return res.status(400).json({
        message: "Insufficient purchased credits",
        available_purchased_credits: user.purchased_credits ?? 0,
        purchased_credits_requested: purchasedToUse,
      });
    }

    if (bonusToUse > 0 && (user.credits ?? 0) < bonusToUse) {
      return res.status(400).json({
        message: "Insufficient bonus credits",
        available_credits: user.credits ?? 0,
        credits_requested: bonusToUse,
      });
    }

    // Nothing left to pay — caller should be using the credit-only flow instead,
    // but guard against it anyway rather than creating a ₹0 Razorpay order.
    if (!amount || isNaN(amount) || Number(amount) <= 0) {
      return res.status(400).json({ message: "No payable amount — use the credit-only portfolio creation flow" });
    }

    const paise = Math.round(Number(amount) * 100);

    const order = await razorpay.orders.create({
      amount: paise,
      currency: "INR",
      receipt: `portfolio_${Date.now()}`,
    });

    await UserPayment.query().insert({
      user_id,
      razorpay_order_id: order.id,
      razorpay_payment_id: order.payments ? order.payments[0]?.id : null,
      amount: Number(amount),
      currency: "INR",
      status: "created",
      plan_type: "portfolio",
      credits_applied: (Number(credits_used) || 0),
      purchased_credits_applied: purchasedToUse,
      bonus_credits_applied: bonusToUse,
    });

    return res.json({
      order_id: order.id,
      amount: order.amount,
      currency: order.currency,
      order,
    });
  } catch (err) {
    console.error("Portfolio createOrder error:", err);
    return res.status(500).json({ message: "Order creation failed" });
  }
};

// VALIDATE DOMAIN
exports.validateDomain = async (req, res) => {
  try {
    const { domain } = req.body;
    const user_id = req.user.user_id;

    if (!domain) {
      return res.status(400).json({ message: "Domain is required" });
    }

    // Check if domain already exists
    const existingPortfolio = await Portfolio.query().findOne({ domain });

    if (existingPortfolio) {
      return res.json({
        available: false,
        message: "Domain already exists"
      });
    }

    return res.json({
      available: true,
      message: "Domain is available"
    });

  } catch (err) {
    console.error("Portfolio validateDomain error:", err);
    return res.status(500).json({ message: "Domain validation failed" });
  }
};

// CREATE PORTFOLIO PROJECT
exports.createPortfolio = async (req, res) => {
  try {
    const {
      portfolio_name,
      description,
      portfolio_type,
      order_id,
      domain,
      credits_used,
      purchased_credits_used,
      bonus_credits_used,
      razorpay_payment_id,
      razorpay_signature,
    } = req.body;
    const user_id = req.user.user_id;

    console.log("createPortfolio request body:", req.body);

    if (!portfolio_name) {
      return res.status(400).json({ message: "Portfolio name is required" });
    }
    if (!portfolio_type) {
      return res.status(400).json({ message: "Portfolio type is required" });
    }

    if (domain) {
      const existingPortfolio = await Portfolio.query().findOne({ user_id, domain });
      if (existingPortfolio) {
        return res.status(400).json({ message: "Domain already exists for this portfolio" });
      }
    }

    const purchasedToUse = Number(purchased_credits_used) || 0;
    const bonusToUse = Number(bonus_credits_used) || 0;
    const creditsToDeduct = Number(credits_used) || (purchasedToUse + bonusToUse) || 0;

    // Re-validate credit balances at creation time regardless of path (guards race conditions)
    if (purchasedToUse > 0 || bonusToUse > 0) {
      const user = await User.query().findById(user_id);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
      if (purchasedToUse > 0 && (user.purchased_credits ?? 0) < purchasedToUse) {
        return res.status(400).json({
          message: "Insufficient purchased credits",
          available_purchased_credits: user.purchased_credits ?? 0,
          purchased_credits_requested: purchasedToUse,
        });
      }
      if (bonusToUse > 0 && (user.credits ?? 0) < bonusToUse) {
        return res.status(400).json({
          message: "Insufficient bonus credits",
          available_credits: user.credits ?? 0,
          credits_requested: bonusToUse,
        });
      }
    }

    let paidAmount = 0;

    if (order_id) {
      // ── Paid path: purchased credits didn't fully cover it, Razorpay order exists ──
      const payment = await UserPayment.query().findOne({
        razorpay_order_id: order_id,
        user_id,
      });

      if (!payment) {
        return res.status(400).json({ message: "Payment not found or invalid" });
      }

      await UserPayment.query()
        .patch({
          razorpay_payment_id,
          razorpay_signature,
          status: "success",
        })
        .where({ razorpay_order_id: order_id });

      paidAmount = payment.amount;
    } else {
      // ── Credit-only path: purchased credits fully covered the base price, Razorpay bypassed ──
      if (creditsToDeduct <= 0) {
        return res.status(400).json({ message: "Order ID is required unless the portfolio is fully covered by credits" });
      }
    }

    // Create portfolio record
    const portfolio = await Portfolio.query().insert({
      user_id,
      portfolio_name: portfolio_name || null,
      description: description || null,
      portfolio_type,
      razorpay_order_id: order_id || null,
      domain: domain || null,
      paid_amount: paidAmount,
      credits_used: creditsToDeduct,
      purchased_credits_used: purchasedToUse,
      // bonus_credits_used: bonusToUse,
      status: "completed",
    });

    console.log("Purchased credits to deduct:", purchasedToUse, "Bonus credits to deduct:", bonusToUse);

    // Deduct credits from the correct balances
    const knex = Portfolio.query().knex();
    if (purchasedToUse > 0) {
      await knex("users").where({ user_id }).decrement("purchased_credits", purchasedToUse);
    }
    if (bonusToUse > 0) {
      await knex("users").where({ user_id }).decrement("credits", bonusToUse);
    }

    // Award 5 bonus credits for every successful portfolio transaction
    await awardBonusCredits(user_id, portfolio.portfolio_id, `Bonus credits for portfolio creation ${portfolio.portfolio_id}`);

    return res.status(201).json({
      message: "Portfolio created successfully",
      portfolio,
    });
  } catch (err) {
    console.error("Portfolio createPortfolio error:", err);
    return res.status(500).json({ message: "Portfolio creation failed" });
  }
};

// GET ALL PORTFOLIOS FOR USER
exports.getUserPortfolios = async (req, res) => {
  try {
    const user_id = req.user.user_id;

    const portfolios = await Portfolio.query().where({ user_id });

    return res.json(portfolios);

  } catch (err) {
    console.error("Portfolio getUserPortfolios error:", err);
    return res.status(500).json({ message: "Error fetching portfolios" });
  }
};

// GET PORTFOLIO BY ID
exports.getPortfolioById = async (req, res) => {
  try {
    const { id } = req.params;
    const user_id = req.user.user_id;

    const portfolio = await Portfolio.query().findOne({
      portfolio_id: id,
      user_id
    });

    if (!portfolio) {
      return res.status(404).json({ message: "Portfolio not found" });
    }

    return res.json(portfolio);

  } catch (err) {
    console.error("Portfolio getPortfolioById error:", err);
    return res.status(500).json({ message: "Error fetching portfolio" });
  }
};

// GET PORTFOLIO BY ID (PUBLIC)
exports.getPortfolioByIdPublic = async (req, res) => {
  try {
    const { id } = req.params;

    const portfolio = await Portfolio.query().findOne({
      portfolio_id: id
    });

    if (!portfolio) {
      return res.status(404).json({ message: "Portfolio not found" });
    }

    return res.json(portfolio);

  } catch (err) {
    console.error("Portfolio getPortfolioByIdPublic error:", err);
    return res.status(500).json({ message: "Error fetching portfolio" });
  }
};

// UPDATE PORTFOLIO
exports.updatePortfolio = async (req, res) => {
  try {
    const { id } = req.params;
    const user_id = req.user.user_id;
    const { portfolio_name, description, portfolio_type, portfolio_json, domain } = req.body;

    const portfolio = await Portfolio.query().findOne({
      portfolio_id: id,
      user_id
    });

    if (!portfolio) {
      return res.status(404).json({ message: "Portfolio not found" });
    }

    // Validate domain if provided and different from current
    if (domain && domain !== portfolio.domain) {
      const existingPortfolio = await Portfolio.query().findOne({ user_id, domain });
      if (existingPortfolio) {
        return res.status(400).json({ message: "Domain already exists for this portfolio" });
      }
    }

    const updated = await Portfolio.query()
      .patch({
        portfolio_name: portfolio_name || portfolio.portfolio_name,
        description: description !== undefined ? description : portfolio.description,
        portfolio_type: portfolio_type || portfolio.portfolio_type,
        portfolio_json: portfolio_json || null,
        domain: domain !== undefined ? domain : portfolio.domain
      })
      .where({ portfolio_id: id });

    return res.json({
      message: "Portfolio updated successfully",
      portfolio: updated
    });

  } catch (err) {
    console.error("Portfolio updatePortfolio error:", err);
    return res.status(500).json({ message: "Error updating portfolio" });
  }
};

// DELETE PORTFOLIO
exports.deletePortfolio = async (req, res) => {
  try {
    const { id } = req.params;
    const user_id = req.user.user_id;

    const portfolio = await Portfolio.query().findOne({
      portfolio_id: id,
      user_id
    });

    if (!portfolio) {
      return res.status(404).json({ message: "Portfolio not found" });
    }

    await Portfolio.query().delete().where({ portfolio_id: id });

    return res.json({ message: "Portfolio deleted successfully" });

  } catch (err) {
    console.error("Portfolio deletePortfolio error:", err);
    return res.status(500).json({ message: "Error deleting portfolio" });
  }
};