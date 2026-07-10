const express = require("express");
const router = express.Router();
const auth = require("../middleware/auth");
const controller = require("../controllers/userController");

router.get("/users/:user_id", auth, controller.getUserById);
router.get("/users/:user_id/check-enhance-used", auth, controller.checkEnhanceUsed);
router.post("/users/:user_id/mark-enhance-used", auth, controller.markEnhanceUsed);
router.post("/users/:user_id/redeem-enhance-with-bonus", auth, controller.redeemEnhanceWithBonus);
router.post("/users/:user_id/redeem-enhance-with-purchased-credits", auth, controller.redeemEnhanceWithPurchasedCredits);
router.post("/users/:user_id/claim-welcome-bonus", auth, controller.claimWelcomeCredit);
router.delete("/api/account-delete/:user_id", auth, controller.deleteAccount);

module.exports = router;
