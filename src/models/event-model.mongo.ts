import { Document, Model, Schema, model } from "mongoose";

export const eventTableName = "Event";

export interface IEvent {
    anonymousId: string;
    sessionId: string;
    userId?: string;
    eventName: string;
    params: Record<string, any>;
    page: string;
    referrer?: string;
    userAgent?: string;
    ip?: string;
    timestamp: Date;
}

export interface EventDocument extends IEvent, Document {
    _id: any;
}

export interface IEventModel extends Model<EventDocument> {}

const eventSchema = new Schema<EventDocument>(
    {
        anonymousId: { type: String, required: true },
        sessionId: { type: String, required: true },
        userId: { type: String, default: null },
        eventName: { type: String, required: true },
        params: { type: Schema.Types.Mixed, default: {} },
        page: { type: String, default: "" },
        referrer: { type: String, default: "" },
        userAgent: { type: String, default: "" },
        ip: { type: String, default: "" },
        timestamp: { type: Date, required: true, default: Date.now },
    },
    { timestamps: false }
);

// Indexes for funnel queries
eventSchema.index({ eventName: 1, timestamp: 1 });
eventSchema.index({ sessionId: 1, timestamp: 1 });
eventSchema.index({ anonymousId: 1, timestamp: 1 });
eventSchema.index({ userId: 1, eventName: 1, timestamp: 1 });

// TTL: auto-delete events older than 90 days
eventSchema.index({ timestamp: 1 }, { expireAfterSeconds: 90 * 24 * 3600 });

const EventModel = model<EventDocument, IEventModel>(
    eventTableName,
    eventSchema
);

export default EventModel;
