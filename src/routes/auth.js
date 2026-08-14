const express = require("express");
const router = express.Router();
const controller = require("../controllers/authController");

router.post("/", controller.authHandler);

router.post("/send-email-otp", controller.sendEmailOtp);
router.post("/verify-email-otp", controller.verifyEmailOtp);
router.post("/forgot-password/send-otp", controller.sendForgotPasswordOtp);
router.post("/forgot-password/verify-otp", controller.verifyForgotPasswordOtp);
router.post("/forgot-password/validate-otp", controller.validateForgotPasswordOtp);
router.post("/forgot-password/change-password", controller.changeForgotPassword);
router.post("/check-coupon", controller.checkCouponCode);
router.post("/admin-login", controller.adminLogin);
module.exports = router;
