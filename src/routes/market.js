const { Router } = require('express');
const Joi = require('joi');
const auth = require('../middleware/auth');
const validate = require('../middleware/validate');
const rateLimiter = require('../middleware/rateLimiter');
const rateLimits = require('../config/rateLimits');
const controller = require('../controllers/marketController');

const router = Router();

router.get('/market/orderbook', auth, controller.orderbook);

router.post(
  '/market/orders',
  auth,
  rateLimiter({ windowMs: rateLimits.market.windowMs, maxRequests: rateLimits.market.maxRequests }),
  validate(Joi.object({
    side: Joi.string().valid('buy', 'sell').required(),
    price: Joi.number().positive().required(),
    quantity: Joi.number().positive().required(),
  })),
  controller.createOrder
);

router.delete('/market/orders/:id', auth, controller.cancelOrder);

module.exports = router;
