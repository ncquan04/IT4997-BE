import express from "express";
import { auth } from "../middlewares/auth";
import { verifyRole } from "../middlewares/verifyRole";
import { UserRole } from "../shared/models/user-model";
import {
    trackEvents,
    queryFunnel,
    queryFunnelTree,
    getEventNames,
    getParamKeys,
    getParamValues,
} from "../services/event.service";

const EventRouter = express.Router();

// Public: receive events from frontend (no auth required for anonymous tracking)
EventRouter.post("/events/track", trackEvents);

// Admin-only: query funnel data (POST — complex body with per-step filters)
EventRouter.post(
    "/events/funnel",
    auth,
    verifyRole([UserRole.ADMIN, UserRole.MANAGER]),
    queryFunnel
);

// Admin-only: query branching funnel tree
EventRouter.post(
    "/events/funnel-tree",
    auth,
    verifyRole([UserRole.ADMIN, UserRole.MANAGER]),
    queryFunnelTree
);

// Admin-only: get list of event names for the dropdown selector
EventRouter.get(
    "/events/names",
    auth,
    verifyRole([UserRole.ADMIN, UserRole.MANAGER]),
    getEventNames
);

// Admin-only: get param keys for a given event name
EventRouter.get(
    "/events/param-keys",
    auth,
    verifyRole([UserRole.ADMIN, UserRole.MANAGER]),
    getParamKeys
);

// Admin-only: get distinct values for a given param key + event name
EventRouter.get(
    "/events/param-values",
    auth,
    verifyRole([UserRole.ADMIN, UserRole.MANAGER]),
    getParamValues
);

export default EventRouter;
