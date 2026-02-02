const marketService = require('../services/marketService');

async function orderbook(req, res, next) {
  try {
    const result = await marketService.getOrderbook();
    res.json(result);
  } catch (err) { next(err); }
}

async function createOrder(req, res, next) {
  try {
    const { side, price, quantity } = req.body;
    const result = await marketService.createOrder(req.agent, side, price, quantity);
    res.status(201).json(result);
  } catch (err) { next(err); }
}

async function cancelOrder(req, res, next) {
  try {
    const result = await marketService.cancelOrder(req.agent, req.params.id);
    res.json(result);
  } catch (err) { next(err); }
}

module.exports = { orderbook, createOrder, cancelOrder };
