import { Request, Response } from "express";
import EventModel from "../models/event-model.mongo";

type FilterOp =
    | "in"
    | "not_in"
    | "eq"
    | "neq"
    | "gt"
    | "gte"
    | "lt"
    | "lte"
    | "exists"
    | "not_exists";

interface StepFilter {
    field: string;
    op: FilterOp;
    value?: any;
}

interface FunnelStepDef {
    eventName: string;
    filters?: StepFilter[];
}

const ALLOWED_OPS = new Set<string>([
    "in",
    "not_in",
    "eq",
    "neq",
    "gt",
    "gte",
    "lt",
    "lte",
    "exists",
    "not_exists",
]);

const ALLOWED_TOP_FIELDS = new Set<string>([
    "page",
    "referrer",
    "userAgent",
    "ip",
    "userId",
    "sessionId",
]);

function resolveField(field: string): string {
    if (ALLOWED_TOP_FIELDS.has(field)) return field;
    if (field.startsWith("params.")) return field;
    return `params.${field}`;
}

function buildFilterMatch(filter: StepFilter): Record<string, any> {
    const field = resolveField(filter.field);
    switch (filter.op) {
        case "in":
            return {
                [field]: {
                    $in: Array.isArray(filter.value)
                        ? filter.value
                        : [filter.value],
                },
            };
        case "not_in":
            return {
                [field]: {
                    $nin: Array.isArray(filter.value)
                        ? filter.value
                        : [filter.value],
                },
            };
        case "eq":
            return { [field]: filter.value };
        case "neq":
            return { [field]: { $ne: filter.value } };
        case "gt":
            return { [field]: { $gt: Number(filter.value) } };
        case "gte":
            return { [field]: { $gte: Number(filter.value) } };
        case "lt":
            return { [field]: { $lt: Number(filter.value) } };
        case "lte":
            return { [field]: { $lte: Number(filter.value) } };
        case "exists":
            return { [field]: { $exists: true, $ne: null } };
        case "not_exists":
            return { [field]: { $exists: false } };
        default:
            return {};
    }
}

function buildStepMatch(
    step: FunnelStepDef,
    fromDate: Date,
    toDate: Date
): Record<string, any> {
    const match: Record<string, any> = {
        eventName: step.eventName,
        timestamp: { $gte: fromDate, $lte: toDate },
    };

    if (step.filters?.length) {
        for (const f of step.filters) {
            if (!f.field || !ALLOWED_OPS.has(f.op)) continue;
            Object.assign(match, buildFilterMatch(f));
        }
    }

    return match;
}

export const trackEvents = async (req: Request, res: Response) => {
    try {
        const { events } = req.body;

        if (!Array.isArray(events) || events.length === 0) {
            return res
                .status(400)
                .json({ message: "events array is required" });
        }

        if (events.length > 50) {
            return res
                .status(400)
                .json({ message: "Maximum 50 events per batch" });
        }

        const enriched = events.map((e: any) => ({
            anonymousId: String(e.anonymousId || ""),
            sessionId: String(e.sessionId || ""),
            userId: e.userId || (req as any).user?._id?.toString() || null,
            eventName: String(e.eventName || ""),
            params: e.params || {},
            page: String(e.page || ""),
            referrer: String(e.referrer || ""),
            userAgent: req.headers["user-agent"] || "",
            ip: req.ip || "",
            timestamp: e.timestamp ? new Date(e.timestamp) : new Date(),
        }));

        // Validate required fields
        for (const ev of enriched) {
            if (!ev.anonymousId || !ev.sessionId || !ev.eventName) {
                return res.status(400).json({
                    message:
                        "Each event must have anonymousId, sessionId, and eventName",
                });
            }
        }

        await EventModel.insertMany(enriched, { ordered: false });
        return res.status(202).json({ message: "ok", count: enriched.length });
    } catch (error: any) {
        console.error("trackEvents error:", error);
        return res.status(500).json({ message: error.message });
    }
};

export const queryFunnel = async (req: Request, res: Response) => {
    try {
        const { steps, from, to } = req.body;

        if (!Array.isArray(steps) || steps.length < 2) {
            return res
                .status(400)
                .json({ message: "At least 2 steps are required" });
        }

        if (steps.length > 10) {
            return res
                .status(400)
                .json({ message: "Maximum 10 steps allowed" });
        }

        const fromDate = from
            ? new Date(Number(from))
            : new Date(Date.now() - 30 * 24 * 3600 * 1000);
        const toDate = to ? new Date(Number(to)) : new Date();

        const step0Match = buildStepMatch(steps[0], fromDate, toDate);
        const step0Events = await EventModel.aggregate([
            { $match: step0Match },
            { $sort: { timestamp: 1 } },
            {
                $group: {
                    _id: "$anonymousId",
                    ts: { $first: "$timestamp" },
                },
            },
        ]);

        let currentUsers = new Map<string, Date>();
        for (const doc of step0Events) {
            currentUsers.set(doc._id, doc.ts);
        }

        const funnelCounts: number[] = [currentUsers.size];

        for (let i = 1; i < steps.length; i++) {
            if (currentUsers.size === 0) {
                funnelCounts.push(0);
                continue;
            }

            const stepMatch = buildStepMatch(steps[i], fromDate, toDate);
            const anonymousIds = Array.from(currentUsers.keys());

            const BATCH_SIZE = 5000;
            const nextUsers = new Map<string, Date>();

            for (let b = 0; b < anonymousIds.length; b += BATCH_SIZE) {
                const batchIds = anonymousIds.slice(b, b + BATCH_SIZE);

                const batchEvents = await EventModel.aggregate([
                    {
                        $match: {
                            ...stepMatch,
                            anonymousId: { $in: batchIds },
                        },
                    },
                    { $sort: { timestamp: 1 } },
                    {
                        $group: {
                            _id: "$anonymousId",
                            events: { $push: { ts: "$timestamp" } },
                        },
                    },
                ]);

                for (const doc of batchEvents) {
                    const prevTs = currentUsers.get(doc._id);
                    if (!prevTs) continue;
                    const validEvent = doc.events.find(
                        (e: any) => e.ts >= prevTs
                    );
                    if (validEvent) {
                        nextUsers.set(doc._id, validEvent.ts);
                    }
                }
            }

            currentUsers = nextUsers;
            funnelCounts.push(currentUsers.size);
        }

        const totalUsers = funnelCounts[0] || 0;
        const funnel = steps.map((step: FunnelStepDef, i: number) => ({
            step: step.eventName,
            index: i,
            count: funnelCounts[i],
            filters: step.filters || [],
            rate:
                totalUsers > 0
                    ? ((funnelCounts[i] / totalUsers) * 100).toFixed(1)
                    : "0",
            dropoff:
                i === 0
                    ? "0"
                    : funnelCounts[i - 1] > 0
                      ? (
                            ((funnelCounts[i - 1] - funnelCounts[i]) /
                                funnelCounts[i - 1]) *
                            100
                        ).toFixed(1)
                      : "0",
        }));

        return res.json({
            steps: steps.map((s: FunnelStepDef) => s.eventName),
            from: fromDate,
            to: toDate,
            totalUsers,
            funnel,
        });
    } catch (error: any) {
        console.error("queryFunnel error:", error);
        return res.status(500).json({ message: error.message });
    }
};

interface TreeNodeDef {
    id: string;
    parentId: string | null;
    eventName: string;
    filters?: StepFilter[];
}

export const queryFunnelTree = async (req: Request, res: Response) => {
    try {
        const { nodes, from, to } = req.body;

        if (!Array.isArray(nodes) || nodes.length < 2) {
            return res
                .status(400)
                .json({ message: "At least 2 nodes are required" });
        }

        if (nodes.length > 30) {
            return res
                .status(400)
                .json({ message: "Maximum 30 nodes allowed" });
        }

        // Validate tree structure
        const nodeMap = new Map<string, TreeNodeDef>();
        for (const n of nodes) {
            if (!n.id || !n.eventName) {
                return res
                    .status(400)
                    .json({ message: "Each node must have id and eventName" });
            }
            nodeMap.set(n.id, n);
        }

        const roots = nodes.filter(
            (n: TreeNodeDef) => n.parentId === null || n.parentId === undefined
        );
        if (roots.length !== 1) {
            return res
                .status(400)
                .json({
                    message: "Exactly one root node (parentId=null) required",
                });
        }

        // Check all parentIds reference existing nodes
        for (const n of nodes) {
            if (n.parentId && !nodeMap.has(n.parentId)) {
                return res.status(400).json({
                    message: `Node "${n.id}" references non-existent parent "${n.parentId}"`,
                });
            }
        }

        const fromDate = from
            ? new Date(Number(from))
            : new Date(Date.now() - 30 * 24 * 3600 * 1000);
        const toDate = to ? new Date(Number(to)) : new Date();

        // Build children map
        const childrenMap = new Map<string, TreeNodeDef[]>();
        for (const n of nodes) {
            const pid = n.parentId ?? "__root__";
            if (!childrenMap.has(pid)) childrenMap.set(pid, []);
            childrenMap.get(pid)!.push(n);
        }

        // BFS from root — carry forward Map<anonymousId, Date> per node
        const root = roots[0] as TreeNodeDef;
        const userSets = new Map<string, Map<string, Date>>();
        const resultMap = new Map<string, { count: number; depth: number }>();

        // Compute depths
        const depthMap = new Map<string, number>();
        const queue: TreeNodeDef[] = [root];
        depthMap.set(root.id, 0);

        // Process root
        const rootMatch = buildStepMatch(root, fromDate, toDate);
        const rootEvents = await EventModel.aggregate([
            { $match: rootMatch },
            { $sort: { timestamp: 1 } },
            {
                $group: {
                    _id: "$anonymousId",
                    ts: { $first: "$timestamp" },
                },
            },
        ]);

        const rootUsers = new Map<string, Date>();
        for (const doc of rootEvents) {
            rootUsers.set(doc._id, doc.ts);
        }
        userSets.set(root.id, rootUsers);
        resultMap.set(root.id, { count: rootUsers.size, depth: 0 });

        const totalUsers = rootUsers.size;

        // BFS
        while (queue.length > 0) {
            const current = queue.shift()!;
            const children = childrenMap.get(current.id) || [];
            const parentUsers = userSets.get(current.id)!;
            const parentDepth = depthMap.get(current.id)!;

            for (const child of children) {
                const childDepth = parentDepth + 1;
                depthMap.set(child.id, childDepth);
                queue.push(child);

                if (!parentUsers || parentUsers.size === 0) {
                    userSets.set(child.id, new Map());
                    resultMap.set(child.id, {
                        count: 0,
                        depth: childDepth,
                    });
                    continue;
                }

                const stepMatch = buildStepMatch(child, fromDate, toDate);
                const anonymousIds = Array.from(parentUsers.keys());

                const BATCH_SIZE = 5000;
                const childUsers = new Map<string, Date>();

                for (let b = 0; b < anonymousIds.length; b += BATCH_SIZE) {
                    const batchIds = anonymousIds.slice(b, b + BATCH_SIZE);
                    const batchEvents = await EventModel.aggregate([
                        {
                            $match: {
                                ...stepMatch,
                                anonymousId: { $in: batchIds },
                            },
                        },
                        { $sort: { timestamp: 1 } },
                        {
                            $group: {
                                _id: "$anonymousId",
                                events: {
                                    $push: { ts: "$timestamp" },
                                },
                            },
                        },
                    ]);

                    for (const doc of batchEvents) {
                        const prevTs = parentUsers.get(doc._id);
                        if (!prevTs) continue;
                        const validEvent = doc.events.find(
                            (e: any) => e.ts >= prevTs
                        );
                        if (validEvent) {
                            childUsers.set(doc._id, validEvent.ts);
                        }
                    }
                }

                userSets.set(child.id, childUsers);
                resultMap.set(child.id, {
                    count: childUsers.size,
                    depth: childDepth,
                });
            }
        }

        // Build response
        const resultNodes = nodes.map((n: TreeNodeDef) => {
            const r = resultMap.get(n.id) || { count: 0, depth: 0 };
            const parentCount =
                n.parentId && resultMap.has(n.parentId)
                    ? resultMap.get(n.parentId)!.count
                    : 0;

            return {
                id: n.id,
                parentId: n.parentId,
                step: n.eventName,
                count: r.count,
                depth: r.depth,
                filters: n.filters || [],
                rate:
                    totalUsers > 0
                        ? ((r.count / totalUsers) * 100).toFixed(1)
                        : "0",
                dropoff:
                    n.parentId === null || n.parentId === undefined
                        ? "0"
                        : parentCount > 0
                          ? (
                                ((parentCount - r.count) / parentCount) *
                                100
                            ).toFixed(1)
                          : "0",
            };
        });

        return res.json({
            nodes: resultNodes,
            totalUsers,
            from: fromDate,
            to: toDate,
        });
    } catch (error: any) {
        console.error("queryFunnelTree error:", error);
        return res.status(500).json({ message: error.message });
    }
};

export const getEventNames = async (req: Request, res: Response) => {
    try {
        const names = await EventModel.distinct("eventName");
        return res.json({ eventNames: names.sort() });
    } catch (error: any) {
        console.error("getEventNames error:", error);
        return res.status(500).json({ message: error.message });
    }
};

export const getParamKeys = async (req: Request, res: Response) => {
    try {
        const { eventName } = req.query;
        if (!eventName || typeof eventName !== "string") {
            return res
                .status(400)
                .json({ message: "eventName query param is required" });
        }

        // Sample up to 200 recent events of this type and collect param keys
        const docs = await EventModel.find({ eventName }, { params: 1 })
            .sort({ timestamp: -1 })
            .limit(200)
            .lean();

        const keySet = new Set<string>();
        for (const doc of docs) {
            if (doc.params && typeof doc.params === "object") {
                for (const key of Object.keys(doc.params)) {
                    keySet.add(key);
                }
            }
        }

        // Also include top-level queryable fields
        const topFields = ["page", "referrer", "userId"];
        return res.json({
            paramKeys: [...topFields, ...Array.from(keySet).sort()],
        });
    } catch (error: any) {
        console.error("getParamKeys error:", error);
        return res.status(500).json({ message: error.message });
    }
};

export const getParamValues = async (req: Request, res: Response) => {
    try {
        const { eventName, field } = req.query;
        if (
            !eventName ||
            typeof eventName !== "string" ||
            !field ||
            typeof field !== "string"
        ) {
            return res
                .status(400)
                .json({ message: "eventName and field query params required" });
        }

        const resolvedField = resolveField(field);

        const values = await EventModel.aggregate([
            { $match: { eventName } },
            {
                $group: {
                    _id: `$${resolvedField}`,
                },
            },
            { $limit: 200 },
            { $sort: { _id: 1 } },
        ]);

        return res.json({
            values: values.map((v) => v._id).filter((v) => v != null),
        });
    } catch (error: any) {
        console.error("getParamValues error:", error);
        return res.status(500).json({ message: error.message });
    }
};
