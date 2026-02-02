const balance = require('../config/gameBalance');

/**
 * Match a new order against the order book.
 * Returns { matches: [...], remainingQuantity }
 *
 * Buy order: match against sell orders with price <= buy price (lowest first)
 * Sell order: match against buy orders with price >= sell price (highest first)
 */
function matchOrder(newOrder, oppositeOrders) {
  const matches = [];
  let remaining = parseFloat(newOrder.quantity) - parseFloat(newOrder.filled || 0);

  // Sort: buys descending (best buy first), sells ascending (best sell first)
  const sorted = [...oppositeOrders].sort((a, b) => {
    return newOrder.side === 'buy'
      ? parseFloat(a.price) - parseFloat(b.price)   // sell orders: cheapest first
      : parseFloat(b.price) - parseFloat(a.price);   // buy orders: highest first
  });

  for (const order of sorted) {
    if (remaining <= 0) break;

    const orderRemaining = parseFloat(order.quantity) - parseFloat(order.filled);
    if (orderRemaining <= 0) continue;

    // Check price compatibility
    if (newOrder.side === 'buy' && parseFloat(order.price) > parseFloat(newOrder.price)) continue;
    if (newOrder.side === 'sell' && parseFloat(order.price) < parseFloat(newOrder.price)) continue;

    const fillQty = Math.min(remaining, orderRemaining);
    const fillPrice = parseFloat(order.price); // price-time priority: use resting order price
    const fee = fillQty * fillPrice * balance.MARKET_FEE_PERCENT;

    matches.push({
      orderId: order.id,
      agentId: order.agent_id,
      quantity: Math.round(fillQty * 100) / 100,
      price: fillPrice,
      fee: Math.round(fee * 10000) / 10000,
    });

    remaining -= fillQty;
  }

  return {
    matches,
    remainingQuantity: Math.round(Math.max(0, remaining) * 100) / 100,
  };
}

module.exports = { matchOrder };
