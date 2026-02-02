const allianceService = require('../services/allianceService');

async function create(req, res, next) {
  try {
    const result = await allianceService.createAlliance(req.agent, req.body.name);
    res.status(201).json(result);
  } catch (err) { next(err); }
}

async function get(req, res, next) {
  try {
    const result = await allianceService.getAlliance(req.params.id);
    res.json(result);
  } catch (err) { next(err); }
}

async function apply(req, res, next) {
  try {
    const result = await allianceService.apply(req.agent, req.params.id);
    res.json(result);
  } catch (err) { next(err); }
}

async function applications(req, res, next) {
  try {
    const result = await allianceService.getApplications(req.agent);
    res.json({ applications: result });
  } catch (err) { next(err); }
}

async function accept(req, res, next) {
  try {
    const result = await allianceService.acceptApplication(req.agent, req.params.applicationId);
    res.json(result);
  } catch (err) { next(err); }
}

async function reject(req, res, next) {
  try {
    const result = await allianceService.rejectApplication(req.agent, req.params.applicationId);
    res.json(result);
  } catch (err) { next(err); }
}

async function leave(req, res, next) {
  try {
    const result = await allianceService.leave(req.agent);
    res.json(result);
  } catch (err) { next(err); }
}

async function donate(req, res, next) {
  try {
    const result = await allianceService.donate(req.agent, req.body.amount);
    res.json(result);
  } catch (err) { next(err); }
}

async function upgrade(req, res, next) {
  try {
    const result = await allianceService.upgradeAlliance(req.agent);
    res.json(result);
  } catch (err) { next(err); }
}

module.exports = { create, get, apply, applications, accept, reject, leave, donate, upgrade };
