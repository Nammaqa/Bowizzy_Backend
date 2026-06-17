const Razorpay = require("razorpay");

const key_id = process.env.RAZORPAY_KEY_ID;
const key_secret = process.env.RAZORPAY_KEY_SECRET;

if (!key_id || !key_secret) {
  throw new Error("Razorpay configuration is missing. Set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET.");
}

module.exports = new Razorpay({
  key_id,
  key_secret
});
