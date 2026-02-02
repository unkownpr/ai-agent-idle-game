const supabase = require('../config/supabase');
const balance = require('../config/gameBalance');
const { matchOrder } = require('../engine/marketMatcher');
const { AppError, NotFoundError, ForbiddenError, InsufficientFundsError } = require('../utils/errors');

async function getOrderbook() {
  const { data: buys } = await supabase
    .from('market_orders')
    .select('id, agent_id, price, quantity, filled, created_at')
    .eq('side', 'buy')
    .eq('status', 'open')
    .order('price', { ascending: false })
    .limit(50);

  const { data: sells } = await supabase
    .from('market_orders')
    .select('id, agent_id, price, quantity, filled, created_at')
    .eq('side', 'sell')
    .eq('status', 'open')
    .order('price', { ascending: true })
    .limit(50);

  return { buys: buys || [], sells: sells || [] };
}

async function createOrder(agent, side, price, quantity) {
  // Validate minimum
  if (quantity < balance.MARKET_MIN_ORDER) {
    throw new AppError(`Minimum order: ${balance.MARKET_MIN_ORDER}`, 400, 'MIN_ORDER');
  }

  // Atomic escrow: deduct funds upfront
  if (side === 'buy') {
    const cost = price * quantity;
    const { data: success, error } = await supabase.rpc('deduct_gold', {
      p_agent_id: agent.id,
      p_amount: cost,
    });
    if (error) throw new AppError(error.message, 500, 'DB_ERROR');
    if (!success) {
      throw new InsufficientFundsError(`Need ${cost} gold for this buy order`);
    }
  } else {
    const { data: success, error } = await supabase.rpc('deduct_gems', {
      p_agent_id: agent.id,
      p_amount: quantity,
    });
    if (error) throw new AppError(error.message, 500, 'DB_ERROR');
    if (!success) {
      throw new InsufficientFundsError(`Need ${quantity} gems for this sell order`);
    }
  }

  // Insert order
  const { data: order, error } = await supabase
    .from('market_orders')
    .insert({ agent_id: agent.id, side, price, quantity })
    .select()
    .single();

  if (error) throw new AppError(error.message, 500, 'DB_ERROR');

  // Try to match
  const oppositeSide = side === 'buy' ? 'sell' : 'buy';
  const { data: oppositeOrders } = await supabase
    .from('market_orders')
    .select('*')
    .eq('side', oppositeSide)
    .eq('status', 'open')
    .order('price', { ascending: oppositeSide === 'sell' });

  const { matches, remainingQuantity } = matchOrder(order, oppositeOrders || []);

  // Process matches
  for (const match of matches) {
    await executeMatch(order, match, side);
  }

  // Update order status
  const filledQty = quantity - remainingQuantity;
  const newStatus = remainingQuantity <= 0 ? 'filled' : 'open';

  await supabase
    .from('market_orders')
    .update({ filled: filledQty, status: newStatus })
    .eq('id', order.id);

  return { order: { ...order, filled: filledQty, status: newStatus }, matches };
}

async function executeMatch(takerOrder, match, takerSide) {
  const { orderId, agentId, quantity, price, fee } = match;

  const buyerId = takerSide === 'buy' ? takerOrder.agent_id : agentId;
  const sellerId = takerSide === 'sell' ? takerOrder.agent_id : agentId;
  const buyOrderId = takerSide === 'buy' ? takerOrder.id : orderId;
  const sellOrderId = takerSide === 'sell' ? takerOrder.id : orderId;

  const goldAmount = price * quantity;

  // Buyer gets gems (atomic)
  await supabase.rpc('add_gems', { p_agent_id: buyerId, p_amount: quantity });

  // Seller gets gold minus fee (atomic)
  await supabase.rpc('add_gold', { p_agent_id: sellerId, p_amount: goldAmount - fee });

  // If taker is buyer and price was lower than expected, refund difference
  if (takerSide === 'buy' && price < parseFloat(takerOrder.price)) {
    const refund = (parseFloat(takerOrder.price) - price) * quantity;
    await supabase.rpc('add_gold', { p_agent_id: takerOrder.agent_id, p_amount: refund });
  }

  // Update resting order
  const { data: restingOrder } = await supabase
    .from('market_orders')
    .select('quantity, filled')
    .eq('id', orderId)
    .single();

  const newFilled = parseFloat(restingOrder.filled) + quantity;
  const restingStatus = newFilled >= parseFloat(restingOrder.quantity) ? 'filled' : 'open';

  await supabase
    .from('market_orders')
    .update({ filled: newFilled, status: restingStatus })
    .eq('id', orderId);

  // Log trade
  await supabase.from('trade_log').insert({
    buy_order_id: buyOrderId,
    sell_order_id: sellOrderId,
    buyer_id: buyerId,
    seller_id: sellerId,
    price,
    quantity,
    fee,
  });
}

async function cancelOrder(agent, orderId) {
  const { data: order, error } = await supabase
    .from('market_orders')
    .select('*')
    .eq('id', orderId)
    .eq('status', 'open')
    .single();

  if (error || !order) throw new NotFoundError('Order not found or already closed');
  if (order.agent_id !== agent.id) throw new ForbiddenError('Not your order');

  const remaining = parseFloat(order.quantity) - parseFloat(order.filled);

  // Refund escrowed amount (atomic)
  if (order.side === 'buy') {
    const refund = parseFloat(order.price) * remaining;
    await supabase.rpc('add_gold', { p_agent_id: agent.id, p_amount: refund });
  } else {
    await supabase.rpc('add_gems', { p_agent_id: agent.id, p_amount: remaining });
  }

  await supabase
    .from('market_orders')
    .update({ status: 'cancelled' })
    .eq('id', orderId);

  return { cancelled: true, refunded: remaining };
}

module.exports = { getOrderbook, createOrder, cancelOrder };
